"""Text frame -> runs + Miro-safe HTML extraction."""

import html as html_lib

_ALIGN = {
    "LEFT": "left",
    "CENTER": "center",
    "RIGHT": "right",
    "JUSTIFY": "left",
    "JUSTIFY_LOW": "left",
    "DISTRIBUTE": "left",
    "THAI_DISTRIBUTE": "left",
}

_VANCHOR = {"TOP": "top", "MIDDLE": "middle", "BOTTOM": "bottom"}


def _enum_name(value):
    if value is None:
        return None
    return str(value).split(".")[-1].split(" ")[0]


def _align_name(alignment):
    return _ALIGN.get(_enum_name(alignment), "left")


def _vanchor_name(anchor):
    return _VANCHOR.get(_enum_name(anchor), "middle")


def extract_text(text_frame, theme):
    """Return a dict with content/html/alignment/runs, or None when empty."""
    if text_frame is None:
        return None

    full_text = text_frame.text.strip()
    if not full_text:
        return None

    runs = []
    html_parts = []
    first_align = "left"

    for i, para in enumerate(text_frame.paragraphs):
        align = _align_name(para.alignment)
        if i == 0:
            first_align = align

        para_parts = []
        for run in para.runs:
            font = run.font
            try:
                color = theme.color(font.color)
            except Exception:
                color = None
            try:
                size = float(font.size.pt) if font.size is not None else None
            except Exception:
                size = None

            run_data = {
                "text": run.text,
                "font_name": font.name,
                "font_size_pt": size,
                "bold": bool(font.bold),
                "italic": bool(font.italic),
                "underline": bool(font.underline),
                "color": color,
            }
            runs.append(run_data)

            # Miro rich-text accepts a small tag whitelist; escape everything else.
            esc = html_lib.escape(run.text)
            if run_data["bold"]:
                esc = "<strong>%s</strong>" % esc
            if run_data["italic"]:
                esc = "<em>%s</em>" % esc
            if run_data["underline"]:
                esc = "<u>%s</u>" % esc
            para_parts.append(esc)

        # A paragraph can carry text with no explicit runs (paragraph-level props).
        inner = "".join(para_parts) if para_parts else html_lib.escape(para.text)
        html_parts.append("<p>%s</p>" % inner)

    return {
        "content": full_text,
        "html": "".join(html_parts),
        "alignment": first_align,
        "vertical_alignment": _vanchor_name(getattr(text_frame, "vertical_anchor", None)),
        "runs": runs,
    }
