import {mouseToCoords} from "./util";

const SEG_TYPE_INITIAL = "initial";
const SEG_TYPE_LINE = "line";

export function MultiPath(initialPos, map, measurementTool) {
    let initialSeg = new PathSegment(this, SEG_TYPE_INITIAL, initialPos, 0, "0");
    this.segments = [initialSeg];
    this.map = map;
    this.length = 0;
    this.measurementTool = measurementTool;
}

MultiPath.prototype.segmentCount = function () {
    return this.segments.length - 1; // except start point segment
};

MultiPath.prototype.recalculateLength = function () {
    return this.segments.length - 1;
};

MultiPath.prototype.createMarker = function (mapPos, text) {
    let marker = new ymaps.Placemark(mapPos, {
        iconContent: ""
    }, {
        preset: 'islands#redStretchyIcon',
    });
    marker.events.add('click', (e) => {
        if (this.measurementTool.enabled && this.measurementTool.edit) {
            this.pushEmptySegment(mouseToCoords(e));
        }
    });
    marker.properties.set("iconContent", text);
    return marker;
};


MultiPath.prototype.pushEmptySegment = function () {
    let lastSegIdx = this.segments.length - 1;
    let lastSeg = this.segments[lastSegIdx];
    let pos = lastSeg.end;

    let riverSegId = lastSeg.lineId;
    this.length += lastSeg.len;

    let newSegment = new PathSegment(this, SEG_TYPE_LINE, pos, 0, lenText(this.length));
    newSegment.lineId = riverSegId;
    this.segments.push(newSegment);

    this.map.geoObjects.add(newSegment.placemark);
    this.map.geoObjects.add(newSegment.pathLine);

    if (this.onChangeSegmentCount) {
        this.onChangeSegmentCount();
    }

    return newSegment;
};

MultiPath.prototype.removeLastSegments = function (n) {
    if (!n) {
        n = 1;
    }
    let segCount = this.segments.length;
    n = Math.min(segCount - 1, n);
    if (n > 0) {
        let prevSeg = this.segments[segCount - n - 1];
        for (let i = 0; i < n; i++) {
            this.map.geoObjects.remove(this.segments[segCount - i - 1].placemark);
            this.map.geoObjects.remove(this.segments[segCount - i - 1].pathLine);
        }
        this.mapPos = prevSeg.placemark.geometry.coordinates;
        this.segments.splice(-n, n);

        segCount = this.segments.length;
        this.length = this.segments.map((s, idx) => idx == segCount - 1 ? 0 : s.len).reduce((a, b) => a + b);
    }

    if (this.onChangeSegmentCount) {
        this.onChangeSegmentCount();
    }
};

MultiPath.prototype.setStartMarkerPos = function (mapPos, lineId) {
    let s0 = this.segments[0];
    s0.placemark.geometry.setCoordinates(mapPos);
    s0.pathLine.geometry.setCoordinates([mapPos, mapPos]);
    s0.end = mapPos;
    s0.lineId = lineId;
};

MultiPath.prototype.show = function () {
    this.segments.forEach((seg, idx) => {
        if (!this.measurementTool.edit && idx == this.segments.length - 1) {
            return
        }
        this.map.geoObjects.add(seg.placemark);
        if (seg.type != SEG_TYPE_INITIAL) {
            this.map.geoObjects.add(seg.pathLine);
        }
    });
};

MultiPath.prototype.showLast = function () {
    let seg = this.segments[this.segments.length - 1];
    this.map.geoObjects.add(seg.placemark);
    this.map.geoObjects.add(seg.pathLine);
};


MultiPath.prototype.hide = function () {
    this.segments.forEach((seg) => {
        this.map.geoObjects.remove(seg.placemark);
        this.map.geoObjects.remove(seg.pathLine);
    });
};


MultiPath.prototype.hideLast = function () {
    let seg = this.segments[this.segments.length - 1];
    this.map.geoObjects.remove(seg.placemark);
    this.map.geoObjects.remove(seg.pathLine);
};

MultiPath.prototype.setLine = function (mapPos, riverSegId, length) {
    let lastSegIdx = this.segments.length - 1;
    let lastSeg = this.segments[lastSegIdx];
    if (lastSeg.type == SEG_TYPE_INITIAL) {
        throw "Can't remove initial segment"
    } else {
        lastSeg.end = mapPos;
    }

    let prevSeg = this.segments[this.segments.length - 2];

    lastSeg.len = length;
    lastSeg.placemark.properties.set("iconContent", lenText(this.length + lastSeg.len));
    lastSeg.placemark.geometry.setCoordinates(mapPos);
    let path = [prevSeg.end, mapPos];
    lastSeg.pathLine.geometry.setCoordinates(path);
    lastSeg.lineId = riverSegId;
};


MultiPath.prototype.setTrack = function (path, riverSegId, length) {
    let lastSegIdx = this.segments.length - 1;
    let lastSeg = this.segments[lastSegIdx];
    let mapPos = path[path.length - 1];

    if (lastSeg.type == SEG_TYPE_INITIAL) {
        throw "Can't remove initial segment"
    } else {
        lastSeg.end = mapPos;
    }

    lastSeg.len = length;
    lastSeg.placemark.properties.set("iconContent", lenText(this.length + lastSeg.len));
    lastSeg.placemark.geometry.setCoordinates(mapPos);
    lastSeg.pathLine.geometry.setCoordinates(path);
    lastSeg.lineId = riverSegId;
};


MultiPath.prototype.pointEnd = function () {
    return this.segments[this.segments.length - 2].end;
};

MultiPath.prototype.riverSegmentIdPrev = function () {
    return this.segments[this.segments.length - 2].lineId;
};

MultiPath.prototype.createGpx = function () {
    if (this.segments.length < 3) {
        return
    }
    var doc = document.implementation.createDocument("", "", null);
    var gpxEl = doc.createElement("gpx");
    var trkEl = doc.createElement("trk");
    this.segments
        .filter((s, idx) => idx != 0 && idx != (this.segments.length - 1))
        .forEach(function (s) {
            var trkSegEl = doc.createElement("trkseg");

            let c = s.pathLine.geometry.getCoordinates();
            c.forEach(p => {
                let trkPtEl = doc.createElement("trkpt");
                trkPtEl.setAttribute("lat", p[0]);
                trkPtEl.setAttribute("lon", p[1]);
                trkSegEl.appendChild(trkPtEl);
            });

            trkEl.appendChild(trkSegEl);
        });

    gpxEl.appendChild(trkEl);
    doc.appendChild(gpxEl);
    var xmlSerializer = new XMLSerializer();
    return '<?xml version="1.0" encoding="UTF-8"?>' + xmlSerializer.serializeToString(doc)
};

function PathSegment(registry, type, end, len, text) {
    this.registry = registry;
    this.end = end;
    this.len = len;
    this.placemark = registry.createMarker(end, text);
    this.pathLine = createSlice([end, end]);
    this.lineId = -1;
    this.type = type;
}

PathSegment.prototype.removeFromMap = function () {
    this.registry.map.geoObjects.remove(this.placemark);
};

function RoutingSegment(lineId, mapPos, path) {
    this.lineId = lineId;
    this.end = mapPos;
    this.path = path;
}

function createSlice(coords) {
    return new ymaps.Polyline(coords, {}, {
        strokeColor: "#FF0000",
        strokeWidth: 5,
        zIndex: 1000,
    });
}

function lenText(x) {
    if (x < 1000) {
        return Math.floor(x) + " m";
    }
    if (x < 5000) {
        return Math.floor(x / 100) / 10 + " km"
    }
    return Math.floor(x / 1000) + "km"
}