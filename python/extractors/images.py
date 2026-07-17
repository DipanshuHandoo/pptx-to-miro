"""Picture extraction: writes image blobs to disk and records placement.

Handles the common modern-Office case where an icon is stored as an SVG: the
``<p:pic>`` has no PNG ``r:embed`` on its main blip (so python-pptx's
``shape.image`` raises "no embedded image"), and the real asset lives in an
``<asvg:svgBlip>`` extension relationship. We fall back to reading that part
directly. Miro accepts SVG, so these are recoverable.
"""

import os

from pptx.oxml.ns import qn
from .shapes import emu_to_pt

# Microsoft SVG extension namespace (not in python-pptx's default nsmap).
_SVG_NS = "http://schemas.microsoft.com/office/drawing/2016/SVG/main"

# Extensions Miro can ingest as image items.
_MIRO_SUPPORTED = {"png", "jpg", "jpeg", "gif", "bmp", "svg", "webp"}


def _ext_from(content_type, partname):
    if content_type:
        ct = content_type.lower()
        if "svg" in ct:
            return "svg"
        if "png" in ct:
            return "png"
        if "jpeg" in ct or "jpg" in ct:
            return "jpeg"
        if "gif" in ct:
            return "gif"
        if "bmp" in ct:
            return "bmp"
    name = str(partname)
    if "." in name:
        return name.rsplit(".", 1)[-1].lower()
    return "bin"


def _blob_via_xml(shape):
    """Fallback: resolve the picture's blob from the blip XML (SVG or linked embed).

    Returns (blob, ext) or (None, None).
    """
    try:
        blip = shape._element.find(".//" + qn("a:blip"))
        if blip is None:
            return None, None

        # Prefer the SVG asset when present (scalable, Miro-supported).
        embed = None
        svg = blip.find(".//{%s}svgBlip" % _SVG_NS)
        if svg is not None:
            embed = svg.get(qn("r:embed"))
        if embed is None:
            embed = blip.get(qn("r:embed"))
        if not embed:
            return None, None

        part = shape.part.related_part(embed)
        return part.blob, _ext_from(getattr(part, "content_type", None), getattr(part, "partname", ""))
    except Exception:
        return None, None


def extract_image(shape, box, output_dir):
    """box = (left, top, width, height) in EMU, already group-transformed.

    Returns a dict or None. EMF/WMF are recorded but flagged unsupported so the
    Node layer can skip the upload cleanly.
    """
    blob = None
    ext = None

    try:
        image = shape.image
        blob = image.blob
        ext = (image.ext or "").lower()
    except Exception:
        blob, ext = _blob_via_xml(shape)

    if blob is None:
        return None

    if ext == "svg+xml":
        ext = "svg"
    elif ext == "jpe":
        ext = "jpeg"

    images_dir = os.path.join(output_dir, "images")
    os.makedirs(images_dir, exist_ok=True)

    filename = "image_%s.%s" % (shape.shape_id, ext or "bin")
    file_path = os.path.join(images_dir, filename)

    try:
        with open(file_path, "wb") as f:
            f.write(blob)
    except Exception:
        return None

    left, top, width, height = box
    return {
        "id": "image_%s" % shape.shape_id,
        "pptx_shape_id": shape.shape_id,
        "name": shape.name,
        "type": "SVG" if ext == "svg" else "IMAGE",
        "x_pt": emu_to_pt(left),
        "y_pt": emu_to_pt(top),
        "width_pt": emu_to_pt(width),
        "height_pt": emu_to_pt(height),
        "rotation": float(shape.rotation or 0.0),
        "format": ext,
        "supported": ext in _MIRO_SUPPORTED,
        "file_path": file_path,
    }
