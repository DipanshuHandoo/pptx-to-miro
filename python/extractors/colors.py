"""Color resolution, including theme colors.

python-pptx exposes ``color.rgb`` only for explicit RGB colors. Most real-world
decks use *theme* colors (accent1, tx1, bg1, ...), for which ``.rgb`` raises.
This module reads the presentation theme + the slide master's color map so those
theme colors resolve to concrete hex values instead of silently becoming null.
"""

from lxml import etree
from pptx.oxml.ns import qn
from pptx.enum.dml import MSO_COLOR_TYPE

# MSO_THEME_COLOR member name -> theme color-scheme slot (or clrMap key).
THEME_SLOT = {
    "DARK_1": "dk1",
    "LIGHT_1": "lt1",
    "DARK_2": "dk2",
    "LIGHT_2": "lt2",
    "ACCENT_1": "accent1",
    "ACCENT_2": "accent2",
    "ACCENT_3": "accent3",
    "ACCENT_4": "accent4",
    "ACCENT_5": "accent5",
    "ACCENT_6": "accent6",
    "HYPERLINK": "hlink",
    "FOLLOWED_HYPERLINK": "folHlink",
    # These map through the slide master's <p:clrMap> before hitting the scheme.
    "TEXT_1": "tx1",
    "TEXT_2": "tx2",
    "BACKGROUND_1": "bg1",
    "BACKGROUND_2": "bg2",
}

_MAPPED_SLOTS = {"tx1", "tx2", "bg1", "bg2"}


def _apply_brightness(hex_str, brightness):
    """Lighten (brightness > 0) or darken (< 0) a hex color, mirroring PPTX tint/shade."""
    h = hex_str.lstrip("#")
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)

    def adj(c):
        if brightness > 0:
            return c + (255 - c) * brightness
        return c * (1 + brightness)

    def clamp(c):
        return max(0, min(255, round(c)))

    return "#%02X%02X%02X" % (clamp(adj(r)), clamp(adj(g)), clamp(adj(b)))


class ThemeResolver:
    """Resolves python-pptx ColorFormat objects to hex strings, theme-aware."""

    def __init__(self, prs):
        self.scheme = {}   # slot name -> "#RRGGBB"
        self.clr_map = {}  # tx1/bg1/... -> scheme slot
        self._load(prs)

    def _load(self, prs):
        try:
            master = prs.slide_masters[0]
        except (IndexError, AttributeError):
            return

        mel = getattr(master, "element", None)
        if mel is None:
            mel = getattr(master, "_element", None)

        # Color map: <p:clrMap bg1="lt1" tx1="dk1" .../>
        try:
            clr_map = mel.find(qn("p:clrMap")) if mel is not None else None
            if clr_map is not None:
                self.clr_map = dict(clr_map.attrib)
        except Exception:
            pass

        # Theme color scheme lives in the theme part related to the master.
        try:
            theme_part = None
            for rel in master.part.rels.values():
                if "theme" in rel.reltype:
                    theme_part = rel.target_part
                    break
            if theme_part is None:
                return
            root = etree.fromstring(theme_part.blob)
            clr_scheme = root.find(".//" + qn("a:clrScheme"))
            if clr_scheme is None:
                return
            for child in clr_scheme:
                name = etree.QName(child).localname  # dk1, lt1, accent1, ...
                srgb = child.find(qn("a:srgbClr"))
                sysclr = child.find(qn("a:sysClr"))
                if srgb is not None:
                    self.scheme[name] = "#" + srgb.get("val", "000000").upper()
                elif sysclr is not None:
                    self.scheme[name] = "#" + sysclr.get("lastClr", "000000").upper()
        except Exception:
            pass

    def _theme_name(self, color_format):
        try:
            tc = color_format.theme_color
        except Exception:
            return None
        name = getattr(tc, "name", None)
        if name:
            return name
        # Fallbacks for "MSO_THEME_COLOR.ACCENT_1" or "ACCENT_1 (5)"
        return str(tc).split(".")[-1].split(" ")[0]

    def color(self, color_format, apply_brightness=True):
        """Return "#RRGGBB" or None."""
        if color_format is None:
            return None
        try:
            ctype = color_format.type
        except Exception:
            return None
        if ctype is None:
            return None

        try:
            if ctype == MSO_COLOR_TYPE.RGB:
                return "#" + str(color_format.rgb).upper()

            if ctype == MSO_COLOR_TYPE.SCHEME:
                name = self._theme_name(color_format)
                slot = THEME_SLOT.get(name)
                if slot is None:
                    return None
                if slot in _MAPPED_SLOTS:
                    slot = self.clr_map.get(slot, slot)
                hex_val = self.scheme.get(slot)
                if hex_val and apply_brightness:
                    try:
                        b = color_format.brightness
                        if b:
                            hex_val = _apply_brightness(hex_val, b)
                    except Exception:
                        pass
                return hex_val
        except Exception:
            return None
        return None
