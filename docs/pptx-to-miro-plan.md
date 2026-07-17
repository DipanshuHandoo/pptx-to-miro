# PPTX to Miro Conversion Tool — Complete Implementation Plan

## 1. Project Overview

A two-phase CLI tool that:
1. Parses a `.pptx` file using Python (`python-pptx`) and outputs a structured `extraction.json`
2. Reads that JSON using Node.js, maps shapes to Miro REST API payloads, and pushes them to a Miro board

The two layers are decoupled deliberately — the JSON is the contract. The Node.js CLI invokes the Python parser as a child process, waits for the JSON, then drives the Miro API. The web app conversion later wraps the same Node.js logic in an Express server.

---

## 2. Architecture

```
[.pptx file]
     │
     ▼
[Python parser]  ←── python-pptx + lxml raw XML
     │
     ▼
[extraction.json]  ←── normalized, slide-indexed, all shape types
     │
     ▼
[Node.js mapper]  ←── maps PPTX types → Miro API payloads
     │
     ▼
[Miro REST API v2]  ←── shapes, texts, connectors, images
```

Node.js invokes the Python script via `child_process.spawn`, captures stdout as the JSON payload, then proceeds with mapping and API calls.

---

## 3. Project Structure

```
pptx-to-miro/
├── python/
│   ├── requirements.txt
│   ├── parser.py                  # CLI entry point: accepts pptx path, prints JSON to stdout
│   └── extractors/
│       ├── __init__.py
│       ├── shapes.py              # rectangles, circles, text boxes, auto shapes
│       ├── connectors.py          # elbow + straight connectors, raw XML parsing
│       ├── images.py              # pictures, icons (SVG/EMF handling)
│       └── text.py                # text frame → runs extraction
│
├── src/
│   ├── cli.js                     # commander entry point
│   ├── runner.js                  # spawns Python, captures JSON output
│   ├── mapper/
│   │   ├── shapes.js              # PPTX shape → Miro shape payload
│   │   ├── connectors.js          # PPTX connector → Miro connector payload
│   │   ├── images.js              # PPTX image → Miro image payload
│   │   └── coordinates.js         # EMU/pt → Miro canvas coordinate translation
│   ├── miro/
│   │   ├── client.js              # axios instance, auth headers, rate limiter
│   │   ├── shapes.js              # POST /v2/boards/{id}/shapes
│   │   ├── connectors.js          # POST /v2/boards/{id}/connectors
│   │   ├── images.js              # POST /v2/boards/{id}/images (multipart)
│   │   └── texts.js               # POST /v2/boards/{id}/texts
│   └── utils/
│       ├── logger.js
│       └── retry.js
│
├── output/                        # auto-created at runtime
│   ├── extraction.json
│   └── images/                    # extracted image files
│
├── .env.example
├── package.json
└── README.md
```

---

## 4. Technology Stack & Dependencies

### Python
```
python-pptx==0.6.23
lxml>=4.9.0          # already a python-pptx dependency, used for raw XML
Pillow>=9.0.0        # optional: EMF detection, image format inspection
```

### Node.js
```
commander            # CLI argument parsing
axios                # Miro REST API calls
axios-retry          # automatic retry on 429/5xx
form-data            # multipart image uploads
dotenv               # environment config
p-limit              # concurrency control for Miro API calls
```

---

## 5. The JSON Contract (extraction.json)

This is the schema both layers must agree on. The Python parser writes it; the Node.js mapper reads it.

```json
{
  "metadata": {
    "source_file": "workflow.pptx",
    "slide_width_emu": 9144000,
    "slide_height_emu": 5143500,
    "slide_width_pt": 720.0,
    "slide_height_pt": 405.0,
    "slide_count": 1,
    "extracted_at": "2024-01-01T00:00:00Z"
  },
  "slides": [
    {
      "slide_index": 0,
      "slide_number": 1,
      "shapes": [
        {
          "id": "shape_5",
          "pptx_shape_id": 5,
          "name": "Rectangle 1",
          "type": "RECTANGLE",
          "x_pt": 100.5,
          "y_pt": 80.2,
          "width_pt": 200.0,
          "height_pt": 80.0,
          "rotation": 0.0,
          "fill": {
            "type": "SOLID",
            "color": "#4472C4",
            "transparency": 0.0
          },
          "border": {
            "color": "#000000",
            "width_pt": 1.5,
            "style": "SOLID",
            "dash_style": null
          },
          "text": {
            "content": "Process Step",
            "html": "<p><strong>Process Step</strong></p>",
            "alignment": "CENTER",
            "vertical_alignment": "MIDDLE",
            "runs": [
              {
                "text": "Process Step",
                "font_name": "Calibri",
                "font_size_pt": 14.0,
                "bold": true,
                "italic": false,
                "underline": false,
                "color": "#FFFFFF"
              }
            ]
          }
        }
      ],
      "connectors": [
        {
          "id": "connector_10",
          "pptx_shape_id": 10,
          "name": "Connector 1",
          "type": "ELBOW",
          "start_x_pt": 300.5,
          "start_y_pt": 120.0,
          "end_x_pt": 450.0,
          "end_y_pt": 120.0,
          "start_shape_id": "shape_5",
          "end_shape_id": "shape_8",
          "start_connection_idx": 3,
          "end_connection_idx": 1,
          "line": {
            "color": "#000000",
            "width_pt": 1.5,
            "style": "SOLID",
            "arrow_start": "NONE",
            "arrow_end": "ARROW"
          }
        }
      ],
      "images": [
        {
          "id": "image_15",
          "pptx_shape_id": 15,
          "name": "Icon 1",
          "type": "SVG",
          "x_pt": 50.0,
          "y_pt": 50.0,
          "width_pt": 40.0,
          "height_pt": 40.0,
          "rotation": 0.0,
          "format": "svg",
          "file_path": "output/images/image_15.svg"
        }
      ]
    }
  ]
}
```

### Key field notes:
- All positions and sizes are in **points (pt)**, converted from EMU at parse time. `1 pt = 12700 EMU`.
- `x_pt` and `y_pt` are the **top-left corner** of the shape, matching PPTX coordinate convention.
- `id` is a string like `"shape_{pptx_shape_id}"` for easy cross-referencing.
- `text.html` is an HTML string for Miro's rich text content field.
- `start_shape_id` / `end_shape_id` in connectors may be `null` if the connector is floating (not attached to any shape).
- `format` for images is the raw extension: `"png"`, `"jpeg"`, `"svg"`, `"emf"`.

---

## 6. Phase 1 — Python Parser

### Entry point: `python/parser.py`

Accepts two arguments:
1. Path to the `.pptx` file
2. Output directory path

Iterates all slides, calls extractors for each shape, writes `extraction.json` to the output directory, and prints the output path to stdout.

```
Usage: python parser.py <pptx_path> <output_dir>
Stdout: absolute path to the written extraction.json
Stderr: any warnings or errors
Exit code: 0 on success, 1 on failure
```

### EMU to Points Conversion

```python
EMU_PER_PT = 12700

def emu_to_pt(emu_value):
    if emu_value is None:
        return 0.0
    return round(emu_value / EMU_PER_PT, 4)
```

### Color Extraction

python-pptx color objects can be RGB, theme-based, or None. Always normalize to hex string or `null`.

```python
def extract_color(color_format):
    # color_format is shape.fill.fore_color or line.color
    try:
        if color_format is None:
            return None
        rgb = color_format.rgb
        return f"#{rgb}"
    except Exception:
        # Theme color — attempt type lookup, fall back to None
        return None
```

### Fill Extraction

```python
def extract_fill(fill):
    from pptx.enum.dml import MSO_THEME_COLOR
    from pptx.dml.fill import FillElement
    
    try:
        fill_type = fill.type
        if fill_type is None:
            return {"type": "NONE", "color": None, "transparency": 0.0}
        
        type_name = str(fill_type).split('.')[-1]  # e.g. "SOLID"
        
        if type_name == "SOLID":
            color = extract_color(fill.fore_color)
            transparency = fill.fore_color.transparency or 0.0
            return {"type": "SOLID", "color": color, "transparency": transparency}
        
        return {"type": type_name, "color": None, "transparency": 0.0}
    except Exception:
        return {"type": "NONE", "color": None, "transparency": 0.0}
```

### Border/Line Extraction

```python
def extract_line(line):
    try:
        color = extract_color(line.color)
        width_pt = emu_to_pt(line.width) if line.width else 1.0
        
        dash_map = {
            "SOLID": "SOLID",
            "DASH": "DASHED",
            "DOT": "DOTTED",
            "DASH_DOT": "DASHED",
        }
        dash_style = None
        try:
            ds = str(line.dash_style).split('.')[-1]
            dash_style = dash_map.get(ds, "SOLID")
        except Exception:
            dash_style = "SOLID"
        
        return {
            "color": color or "#000000",
            "width_pt": width_pt,
            "style": dash_style,
            "dash_style": dash_style
        }
    except Exception:
        return {"color": "#000000", "width_pt": 1.0, "style": "SOLID", "dash_style": None}
```

### Text Extraction

```python
def extract_text(text_frame):
    if text_frame is None:
        return None
    
    full_text = text_frame.text.strip()
    if not full_text:
        return None
    
    runs = []
    html_parts = []
    
    for para in text_frame.paragraphs:
        para_parts = []
        align = str(para.alignment).split('.')[-1] if para.alignment else "LEFT"
        
        for run in para.runs:
            font = run.font
            color = extract_color(font.color) if font.color and font.color.type else "#000000"
            
            run_data = {
                "text": run.text,
                "font_name": font.name or "Calibri",
                "font_size_pt": font.size / 12700 if font.size else 12.0,
                "bold": font.bold or False,
                "italic": font.italic or False,
                "underline": font.underline or False,
                "color": color
            }
            runs.append(run_data)
            
            # Build HTML representation
            text = run.text
            if run_data["bold"]:
                text = f"<strong>{text}</strong>"
            if run_data["italic"]:
                text = f"<em>{text}</em>"
            if run_data["underline"]:
                text = f"<u>{text}</u>"
            para_parts.append(text)
        
        html_parts.append(f"<p>{''.join(para_parts)}</p>")
    
    align_map = {"LEFT": "left", "CENTER": "center", "RIGHT": "right", "JUSTIFY": "left"}
    v_align_map = {"TOP": "top", "MIDDLE": "middle", "BOTTOM": "bottom"}
    
    h_align = "CENTER"
    v_align = "MIDDLE"
    try:
        h_align = str(text_frame.paragraphs[0].alignment).split('.')[-1]
    except Exception:
        pass
    try:
        v_align = str(text_frame.word_wrap).split('.')[-1]
    except Exception:
        pass
    
    return {
        "content": full_text,
        "html": "".join(html_parts),
        "alignment": align_map.get(h_align, "left"),
        "vertical_alignment": "middle",
        "runs": runs
    }
```

### Shape Type Normalization

```python
from pptx.enum.shapes import MSO_SHAPE_TYPE, MSO_AUTO_SHAPE_TYPE

AUTOSHAPE_TYPE_MAP = {
    "ROUNDED_RECTANGLE": "ROUNDED_RECTANGLE",
    "OVAL": "ELLIPSE",
    "DIAMOND": "DIAMOND",
    "TRIANGLE": "TRIANGLE",
    "RIGHT_TRIANGLE": "TRIANGLE",
    "PARALLELOGRAM": "PARALLELOGRAM",
    "TRAPEZOID": "TRAPEZOID",
    "HEXAGON": "HEXAGON",
    "OCTAGON": "OCTAGON",
    "CROSS": "CROSS",
    "STAR_5_POINT": "STAR",
    "CLOUD": "CLOUD",
    "CYLINDER": "CYLINDER",
}

def get_shape_type(shape):
    shape_type = shape.shape_type
    
    if shape_type == MSO_SHAPE_TYPE.TEXT_BOX:
        return "TEXT_BOX"
    
    if shape_type == MSO_SHAPE_TYPE.PICTURE:
        return "PICTURE"
    
    if shape_type == MSO_SHAPE_TYPE.LINE:
        return "LINE"
    
    if shape_type == MSO_SHAPE_TYPE.AUTO_SHAPE:
        try:
            auto_type = str(shape.auto_shape_type).split('.')[-1]
            return AUTOSHAPE_TYPE_MAP.get(auto_type, "RECTANGLE")
        except Exception:
            return "RECTANGLE"
    
    return "RECTANGLE"
```

### Connector Extraction (critical — uses raw XML)

python-pptx does not fully expose connector topology. Use `lxml` directly.

```python
from lxml import etree

NSMAP = {
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
}

def is_connector(shape):
    # Connectors are <p:cxnSp> elements in the XML
    tag = shape._element.tag
    return tag.endswith('}cxnSp')

def extract_connector(shape, shape_id_to_key):
    el = shape._element
    
    # Connector type: bentConnector3 = ELBOW, straightConnector1 = STRAIGHT
    prst_geom = el.find('.//{%s}prstGeom' % NSMAP['a'])
    connector_type = "STRAIGHT"
    if prst_geom is not None:
        prst = prst_geom.get('prst', '')
        if 'bent' in prst or 'elbow' in prst:
            connector_type = "ELBOW"
    
    # Connection endpoints — reference shape IDs and connection point indices
    start_shape_id = None
    end_shape_id = None
    start_idx = None
    end_idx = None
    
    cNvCxnSpPr = el.find('.//{%s}cNvCxnSpPr' % NSMAP['p'])
    if cNvCxnSpPr is not None:
        stCxn = cNvCxnSpPr.find('{%s}stCxn' % NSMAP['a'])
        endCxn = cNvCxnSpPr.find('{%s}endCxn' % NSMAP['a'])
        
        if stCxn is not None:
            ref_id = int(stCxn.get('id', 0))
            start_shape_id = shape_id_to_key.get(ref_id)
            start_idx = int(stCxn.get('idx', 0))
        
        if endCxn is not None:
            ref_id = int(endCxn.get('id', 0))
            end_shape_id = shape_id_to_key.get(ref_id)
            end_idx = int(endCxn.get('idx', 0))
    
    # Arrow heads from line element
    arrow_start = "NONE"
    arrow_end = "NONE"
    ln_el = el.find('.//{%s}ln' % NSMAP['a'])
    if ln_el is not None:
        head = ln_el.find('{%s}headEnd' % NSMAP['a'])
        tail = ln_el.find('{%s}tailEnd' % NSMAP['a'])
        if head is not None:
            arrow_start = head.get('type', 'none').upper()
        if tail is not None:
            arrow_end = tail.get('type', 'none').upper()
    
    sp_pr = shape.line
    line_data = extract_line(sp_pr)
    line_data['arrow_start'] = arrow_start
    line_data['arrow_end'] = arrow_end
    
    return {
        "id": f"connector_{shape.shape_id}",
        "pptx_shape_id": shape.shape_id,
        "name": shape.name,
        "type": connector_type,
        "start_x_pt": emu_to_pt(shape.left),
        "start_y_pt": emu_to_pt(shape.top),
        "end_x_pt": emu_to_pt(shape.left + shape.width),
        "end_y_pt": emu_to_pt(shape.top + shape.height),
        "start_shape_id": start_shape_id,
        "end_shape_id": end_shape_id,
        "start_connection_idx": start_idx,
        "end_connection_idx": end_idx,
        "line": line_data
    }
```

### Image Extraction

```python
import os
import base64

def extract_image(shape, output_dir):
    try:
        image = shape.image
        ext = image.ext  # 'png', 'jpeg', 'svg+xml', 'emf', 'wmf'
        
        # Normalize extension
        if ext == 'svg+xml':
            ext = 'svg'
        elif ext in ('wmf', 'emf'):
            ext = ext  # flag for downstream handling
        
        filename = f"image_{shape.shape_id}.{ext}"
        file_path = os.path.join(output_dir, 'images', filename)
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        
        with open(file_path, 'wb') as f:
            f.write(image.blob)
        
        return {
            "id": f"image_{shape.shape_id}",
            "pptx_shape_id": shape.shape_id,
            "name": shape.name,
            "type": "SVG" if ext == "svg" else "IMAGE",
            "x_pt": emu_to_pt(shape.left),
            "y_pt": emu_to_pt(shape.top),
            "width_pt": emu_to_pt(shape.width),
            "height_pt": emu_to_pt(shape.height),
            "rotation": shape.rotation or 0.0,
            "format": ext,
            "file_path": file_path
        }
    except Exception as e:
        return None  # Log warning, skip silently
```

### Main Parser Loop

```python
def parse_slide(slide, slide_index, output_dir):
    shapes_out = []
    connectors_out = []
    images_out = []
    
    # Build a shape_id → key map for connector cross-referencing
    shape_id_to_key = {
        shape.shape_id: f"shape_{shape.shape_id}"
        for shape in slide.shapes
        if not is_connector(shape)
    }
    
    for shape in slide.shapes:
        if is_connector(shape):
            connectors_out.append(extract_connector(shape, shape_id_to_key))
            continue
        
        shape_type = get_shape_type(shape)
        
        if shape_type == "PICTURE":
            img = extract_image(shape, output_dir)
            if img:
                images_out.append(img)
            continue
        
        # All other shapes (rectangles, text boxes, ellipses, etc.)
        shapes_out.append({
            "id": f"shape_{shape.shape_id}",
            "pptx_shape_id": shape.shape_id,
            "name": shape.name,
            "type": shape_type,
            "x_pt": emu_to_pt(shape.left),
            "y_pt": emu_to_pt(shape.top),
            "width_pt": emu_to_pt(shape.width),
            "height_pt": emu_to_pt(shape.height),
            "rotation": shape.rotation or 0.0,
            "fill": extract_fill(shape.fill) if hasattr(shape, 'fill') else None,
            "border": extract_line(shape.line) if hasattr(shape, 'line') else None,
            "text": extract_text(shape.text_frame) if shape.has_text_frame else None
        })
    
    return shapes_out, connectors_out, images_out
```

---

## 7. Phase 2 — Node.js CLI

### `src/runner.js` — spawns Python

```javascript
const { spawn } = require('child_process');
const path = require('path');

const runPythonParser = (pptxPath, outputDir) =>
  new Promise((resolve, reject) => {
    const scriptPath = path.resolve(__dirname, '../python/parser.py');
    const proc = spawn('python3', [scriptPath, pptxPath, outputDir]);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', chunk => { stdout += chunk.toString(); });
    proc.stderr.on('data', chunk => { stderr += chunk.toString(); });

    proc.on('close', code => {
      if (code !== 0) {
        return reject(new Error(`Python parser failed:\n${stderr}`));
      }
      const jsonPath = stdout.trim();
      resolve(jsonPath);
    });
  });

module.exports = { runPythonParser };
```

### `src/mapper/coordinates.js` — Coordinate System Translation

PPTX: origin top-left, x right, y down, units = points  
Miro: origin center of board, x right, y down, units = points  

```javascript
/**
 * PPTX top-left (x, y) → Miro center (x, y)
 * Miro position is the CENTER of the element.
 * Offset by half the slide dimensions to re-center around (0,0).
 */
const toMiroPosition = (shape, slideMetadata) => {
  const centerX = shape.x_pt + shape.width_pt / 2;
  const centerY = shape.y_pt + shape.height_pt / 2;

  return {
    x: centerX - slideMetadata.slide_width_pt / 2,
    y: centerY - slideMetadata.slide_height_pt / 2,
    origin: 'center'
  };
};

module.exports = { toMiroPosition };
```

### `src/mapper/shapes.js` — Shape Type Mapping

```javascript
const { toMiroPosition } = require('./coordinates');

// PPTX type → Miro shape string
const SHAPE_TYPE_MAP = {
  RECTANGLE:          'rectangle',
  ROUNDED_RECTANGLE:  'round_rectangle',
  ELLIPSE:            'circle',
  DIAMOND:            'rhombus',
  TRIANGLE:           'triangle',
  PARALLELOGRAM:      'parallelogram',
  TRAPEZOID:          'trapezoid',
  HEXAGON:            'hexagon',
  OCTAGON:            'octagon',
  CROSS:              'cross',
  STAR:               'star',
  CLOUD:              'cloud',
  CYLINDER:           'can',
  TEXT_BOX:           null,  // handled separately as Miro text element
  LINE:               null,  // handled as connector
};

const mapShapeToMiro = (shape, slideMetadata) => {
  const miroType = SHAPE_TYPE_MAP[shape.type];

  // TEXT_BOX → Miro text element
  if (shape.type === 'TEXT_BOX') {
    return {
      elementType: 'text',
      payload: {
        data: { content: shape.text?.html || shape.text?.content || '' },
        style: {
          fillColor: 'transparent',
          fontFamily: 'arial',
          fontSize: String(shape.text?.runs?.[0]?.font_size_pt || 14),
          textAlign: shape.text?.alignment || 'left',
          color: shape.text?.runs?.[0]?.color || '#1a1a1a',
        },
        position: toMiroPosition(shape, slideMetadata),
        geometry: { width: shape.width_pt }
      }
    };
  }

  return {
    elementType: 'shape',
    payload: {
      data: {
        shape: miroType || 'rectangle',
        content: shape.text?.html || ''
      },
      style: {
        fillColor: shape.fill?.color || '#ffffff',
        fillOpacity: shape.fill?.type === 'NONE' ? '0.0' : '1.0',
        fontColor: shape.text?.runs?.[0]?.color || '#1a1a1a',
        fontSize: String(shape.text?.runs?.[0]?.font_size_pt || 14),
        fontFamily: 'arial',
        borderColor: shape.border?.color || '#000000',
        borderWidth: String(shape.border?.width_pt || 1),
        borderOpacity: '1.0',
        borderStyle: shape.border?.style === 'DASHED' ? 'dashed' : 'normal',
        textAlign: shape.text?.alignment || 'center',
        textAlignVertical: shape.text?.vertical_alignment || 'middle',
      },
      position: toMiroPosition(shape, slideMetadata),
      geometry: {
        width: shape.width_pt,
        height: shape.height_pt,
        rotation: shape.rotation || 0
      }
    }
  };
};

module.exports = { mapShapeToMiro };
```

### `src/mapper/connectors.js`

```javascript
const ARROW_CAP_MAP = {
  NONE:     'none',
  ARROW:    'arrow',
  STEALTH:  'stealth',
  DIAMOND:  'diamond',
  OVAL:     'circle',
  TRIANGLE: 'arrow',
};

/**
 * shapeIdMap: { pptx_shape_id_string → miro_element_id }
 * Built after all shapes are created in Miro.
 */
const mapConnectorToMiro = (connector, shapeIdMap) => {
  const payload = {
    shape: connector.type === 'ELBOW' ? 'elbowed' : 'straight',
    style: {
      strokeColor: connector.line?.color || '#000000',
      strokeWidth: String(connector.line?.width_pt || 1),
      strokeStyle: connector.line?.style === 'DASHED' ? 'dashed' : 'normal',
      startStrokeCap: ARROW_CAP_MAP[connector.line?.arrow_start] || 'none',
      endStrokeCap: ARROW_CAP_MAP[connector.line?.arrow_end] || 'arrow',
    }
  };

  // Prefer shape references; fall back to coordinate positions
  if (connector.start_shape_id && shapeIdMap[connector.start_shape_id]) {
    payload.startItem = { id: shapeIdMap[connector.start_shape_id] };
  } else {
    payload.startItem = {
      position: { x: connector.start_x_pt, y: connector.start_y_pt }
    };
  }

  if (connector.end_shape_id && shapeIdMap[connector.end_shape_id]) {
    payload.endItem = { id: shapeIdMap[connector.end_shape_id] };
  } else {
    payload.endItem = {
      position: { x: connector.end_x_pt, y: connector.end_y_pt }
    };
  }

  return payload;
};

module.exports = { mapConnectorToMiro };
```

---

## 8. Phase 3 — Miro API Integration

### Miro Developer Setup (one-time)

1. Go to https://developers.miro.com
2. Click "Create new app"
3. Under "Permissions", enable: `boards:read`, `boards:write`
4. Install the app on your target board
5. Under "Access Token", generate a token
6. Copy the Board ID from the board URL: `https://miro.com/app/board/{BOARD_ID}/`

### `.env.example`

```
MIRO_ACCESS_TOKEN=your_token_here
MIRO_BOARD_ID=your_board_id_here
```

### `src/miro/client.js`

```javascript
const axios = require('axios');
const axiosRetry = require('axios-retry');

const createMiroClient = () => {
  const client = axios.create({
    baseURL: 'https://api.miro.com/v2',
    headers: {
      Authorization: `Bearer ${process.env.MIRO_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    }
  });

  axiosRetry(client, {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) =>
      error.response?.status === 429 || error.response?.status >= 500
  });

  return client;
};

module.exports = { createMiroClient };
```

### `src/miro/shapes.js`

```javascript
const pLimit = require('p-limit');
const limit = pLimit(5); // max 5 concurrent Miro API calls

const createShape = async (client, boardId, payload) => {
  const { data } = await client.post(`/boards/${boardId}/shapes`, payload);
  return data.id;
};

const createText = async (client, boardId, payload) => {
  const { data } = await client.post(`/boards/${boardId}/texts`, payload);
  return data.id;
};

const createAllShapes = async (client, boardId, shapes, slideMetadata) => {
  const { mapShapeToMiro } = require('../mapper/shapes');
  const shapeIdMap = {};  // pptx_id → miro_id

  const tasks = shapes.map(shape =>
    limit(async () => {
      const mapped = mapShapeToMiro(shape, slideMetadata);
      
      let miroId;
      if (mapped.elementType === 'text') {
        miroId = await createText(client, boardId, mapped.payload);
      } else {
        miroId = await createShape(client, boardId, mapped.payload);
      }

      shapeIdMap[shape.id] = miroId;
    })
  );

  await Promise.all(tasks);
  return shapeIdMap;
};

module.exports = { createAllShapes };
```

### `src/miro/connectors.js`

```javascript
const pLimit = require('p-limit');
const limit = pLimit(5);
const { mapConnectorToMiro } = require('../mapper/connectors');

const createAllConnectors = async (client, boardId, connectors, shapeIdMap) => {
  const tasks = connectors.map(connector =>
    limit(async () => {
      const payload = mapConnectorToMiro(connector, shapeIdMap);
      await client.post(`/boards/${boardId}/connectors`, payload);
    })
  );

  await Promise.all(tasks);
};

module.exports = { createAllConnectors };
```

### `src/miro/images.js`

```javascript
const FormData = require('form-data');
const fs = require('fs');
const pLimit = require('p-limit');
const limit = pLimit(3); // image uploads are heavier
const { toMiroPosition } = require('../mapper/coordinates');

const createImage = async (client, boardId, image, slideMetadata) => {
  if (image.format === 'emf' || image.format === 'wmf') {
    // EMF/WMF cannot be uploaded to Miro. Log and skip.
    console.warn(`Skipping EMF/WMF image: ${image.name}`);
    return;
  }

  const form = new FormData();
  form.append('resource', fs.createReadStream(image.file_path));

  const position = toMiroPosition(image, slideMetadata);

  const { data } = await client.post(
    `/boards/${boardId}/images`,
    form,
    {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${process.env.MIRO_ACCESS_TOKEN}`
      },
      params: {
        x: position.x,
        y: position.y,
        width: image.width_pt,
        height: image.height_pt
      }
    }
  );

  return data.id;
};

const createAllImages = async (client, boardId, images, slideMetadata) => {
  const tasks = images.map(img =>
    limit(() => createImage(client, boardId, img, slideMetadata))
  );
  await Promise.all(tasks);
};

module.exports = { createAllImages };
```

---

## 9. CLI Entry Point

### `src/cli.js`

```javascript
require('dotenv').config();
const { program } = require('commander');
const path = require('path');
const fs = require('fs');
const { runPythonParser } = require('./runner');
const { createMiroClient } = require('./miro/client');
const { createAllShapes } = require('./miro/shapes');
const { createAllConnectors } = require('./miro/connectors');
const { createAllImages } = require('./miro/images');

program
  .name('pptx-to-miro')
  .description('Convert a PPTX file to Miro board elements')
  .requiredOption('-f, --file <path>', 'Path to the .pptx file')
  .option('-o, --output <dir>', 'Output directory for extraction JSON', './output')
  .option('--dry-run', 'Parse and map only, do not push to Miro')
  .option('--slide <number>', 'Process a specific slide number (1-indexed)', parseInt)
  .parse(process.argv);

const opts = program.opts();

const run = async () => {
  const pptxPath = path.resolve(opts.file);
  const outputDir = path.resolve(opts.output);

  console.log(`Parsing: ${pptxPath}`);
  const jsonPath = await runPythonParser(pptxPath, outputDir);
  console.log(`Extraction complete: ${jsonPath}`);

  const extraction = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  if (opts.dryRun) {
    console.log('Dry run — skipping Miro push.');
    console.log(JSON.stringify(extraction, null, 2));
    return;
  }

  const boardId = process.env.MIRO_BOARD_ID;
  if (!boardId) throw new Error('MIRO_BOARD_ID not set in environment');

  const client = createMiroClient();

  const slidesToProcess = opts.slide
    ? extraction.slides.filter(s => s.slide_number === opts.slide)
    : extraction.slides;

  for (const slide of slidesToProcess) {
    console.log(`\nProcessing slide ${slide.slide_number}...`);

    // Step 1: Create all shapes and text boxes first
    const shapeIdMap = await createAllShapes(
      client, boardId, slide.shapes, extraction.metadata
    );
    console.log(`  Shapes created: ${Object.keys(shapeIdMap).length}`);

    // Step 2: Create connectors using the shape ID map
    await createAllConnectors(client, boardId, slide.connectors, shapeIdMap);
    console.log(`  Connectors created: ${slide.connectors.length}`);

    // Step 3: Upload images
    await createAllImages(client, boardId, slide.images, extraction.metadata);
    console.log(`  Images uploaded: ${slide.images.length}`);
  }

  console.log('\nDone. Check your Miro board.');
};

run().catch(err => {
  console.error(err.message);
  process.exit(1);
});
```

---

## 10. Error Handling Strategy

| Layer | Error Type | Strategy |
|---|---|---|
| Python parser | Shape with no geometry | Log warning, skip shape |
| Python parser | Color in unsupported format | Fall back to `null`, log |
| Python parser | Image blob read failure | Skip image, log warning |
| Node.js mapper | Unknown PPTX shape type | Map to `rectangle`, log warning |
| Miro API | 429 Too Many Requests | Exponential backoff via axios-retry |
| Miro API | 400 Bad Request | Log full payload + error, skip element |
| Miro API | Connector with missing shape ref | Fall back to coordinate-based connector |
| Node.js runner | Python process non-zero exit | Throw with stderr content |

---

## 11. Known Limitations & Handling

| Issue | Handling |
|---|---|
| EMF/WMF icons (older Office) | Detected by extension, skipped with warning. SVG icons (Office 365) work fine. |
| Grouped shapes | python-pptx can iterate group members. Add group unpacking in parser loop if needed. |
| Gradient fills | Detected, mapped to the first gradient stop color in Miro |
| Curved connectors | Not present per requirements. If encountered, mapped as `straight`. |
| Multi-slide PPT | All slides processed sequentially. Use `--slide` flag to target one. |
| Miro shape type not matching | `SHAPE_TYPE_MAP` unknown key falls back to `rectangle`, logs warning. |

---

## 12. Incremental Build Order

Build and test in this exact order to validate the contract at each step:

1. **Python parser — shapes only** (no connectors, no images). Run on your real PPT. Validate `extraction.json` manually.
2. **Add connector extraction**. Verify `start_shape_id` and `end_shape_id` resolve correctly.
3. **Add image extraction**. Check `output/images/` folder for correct files.
4. **Node.js dry run** (`--dry-run` flag). Validate mapped Miro payloads without touching the API.
5. **Miro API — shapes only**. Push shapes, verify positions visually on the board.
6. **Miro API — connectors**. Verify shape attachment.
7. **Miro API — images**. Upload and verify placement.

---

## 13. Web App Conversion Path

When you're ready to convert to an Express web app, the Node.js layer maps cleanly:

| CLI concern | Web app equivalent |
|---|---|
| `--file` argument | Multer file upload middleware |
| `runPythonParser()` | Same — spawned from Express route handler |
| `--dry-run` output | Return JSON from API endpoint |
| Miro push | Same — driven from POST route |
| `process.env` config | Same `.env` — no changes needed |

The Python parser becomes a sidecar process. No structural changes to the mapper or Miro layers.

---

## 14. Setup Commands

```bash
# Python setup
cd python
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Node.js setup
cd ..
npm install

# Copy env
cp .env.example .env
# Edit .env with your MIRO_ACCESS_TOKEN and MIRO_BOARD_ID

# Run
node src/cli.js --file ./your-file.pptx --output ./output
node src/cli.js --file ./your-file.pptx --dry-run
node src/cli.js --file ./your-file.pptx --slide 2
```