"""Connector extraction via raw DrawingML XML.

python-pptx does not fully expose connector topology, so we read the XML for
the connection endpoints (stCxn/endCxn), the geometry preset (elbow vs straight),
and the arrow heads.
"""

from pptx.oxml.ns import qn
from .shapes import emu_to_pt, extract_line

_ARROW_MAP = {
    "none": "NONE",
    "triangle": "ARROW",
    "arrow": "ARROW",
    "stealth": "STEALTH",
    "diamond": "DIAMOND",
    "oval": "OVAL",
}


def is_connector(shape):
    """Connectors are <p:cxnSp> elements."""
    try:
        return shape._element.tag.endswith("}cxnSp")
    except Exception:
        return False


def _arrow(value):
    if not value:
        return "NONE"
    return _ARROW_MAP.get(value.lower(), value.upper())


def extract_connector(shape, box, shape_id_to_key, theme):
    """box = (left, top, width, height) in EMU, already group-transformed."""
    el = shape._element
    left, top, width, height = box

    # Geometry preset: bentConnectorN -> ELBOW, straightConnector1 -> STRAIGHT.
    connector_type = "STRAIGHT"
    prst_geom = el.find(".//" + qn("a:prstGeom"))
    if prst_geom is not None:
        prst = prst_geom.get("prst", "")
        if "bent" in prst or "elbow" in prst:
            connector_type = "ELBOW"
        elif "curved" in prst:
            connector_type = "CURVED"

    # Endpoint topology.
    start_shape_id = end_shape_id = None
    start_idx = end_idx = None
    cxn_pr = el.find(".//" + qn("p:cNvCxnSpPr"))
    if cxn_pr is not None:
        st = cxn_pr.find(qn("a:stCxn"))
        end = cxn_pr.find(qn("a:endCxn"))
        if st is not None:
            start_shape_id = shape_id_to_key.get(int(st.get("id", 0)))
            start_idx = int(st.get("idx", 0))
        if end is not None:
            end_shape_id = shape_id_to_key.get(int(end.get("id", 0)))
            end_idx = int(end.get("idx", 0))

    # Endpoints from the bounding box, respecting flip.
    sx, sy = left, top
    ex, ey = left + width, top + height
    xfrm = el.find(".//" + qn("a:xfrm"))
    if xfrm is not None:
        if xfrm.get("flipH") == "1":
            sx, ex = ex, sx
        if xfrm.get("flipV") == "1":
            sy, ey = ey, sy

    # Arrow heads.
    arrow_start = arrow_end = "NONE"
    ln = el.find(".//" + qn("a:ln"))
    if ln is not None:
        head = ln.find(qn("a:headEnd"))
        tail = ln.find(qn("a:tailEnd"))
        if head is not None:
            arrow_start = _arrow(head.get("type"))
        if tail is not None:
            arrow_end = _arrow(tail.get("type"))

    try:
        line_data = extract_line(shape.line, theme)
    except Exception:
        line_data = {"color": None, "width_pt": None, "style": "SOLID"}
    line_data["arrow_start"] = arrow_start
    line_data["arrow_end"] = arrow_end

    return {
        "id": "connector_%s" % shape.shape_id,
        "pptx_shape_id": shape.shape_id,
        "name": shape.name,
        "type": connector_type,
        "start_x_pt": emu_to_pt(sx),
        "start_y_pt": emu_to_pt(sy),
        "end_x_pt": emu_to_pt(ex),
        "end_y_pt": emu_to_pt(ey),
        "start_shape_id": start_shape_id,
        "end_shape_id": end_shape_id,
        "start_connection_idx": start_idx,
        "end_connection_idx": end_idx,
        "line": line_data,
    }
