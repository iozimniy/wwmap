function WWMapMeasurementTool(map, objectManager) {
    this.map = map;
    this.objectManager = objectManager;
    this.riverTracks = [];
    this.segments = [];

    this.pos = map.getCenter();
    this.distance = 0;

    this.fixedPath = [];
    this.path = this.createSlice([this.pos, this.pos]);

    let t = this;

    this.reset();
    this.segments[0].marker.events.add('click', function () {
        t.nextSegment();
    });
    this.segments[0].marker.events.add('click', function (e) {
        t.mouseToCoords(e.get('position'))
    });

    $(document).keyup(function (e) {
        if (e.key === "Escape") {
            if (t.segments.length > 1) {
                let lastSegment = t.segments[t.segments.length - 1];
                let prevSegment = t.segments[t.segments.length - 2];
                t.segments.splice(-1, 1);
                t.map.geoObjects.remove(lastSegment.marker);
                t.pos = prevSegment.marker.geometry.coordinates;

                t.fixedPath = [];
                for (let i = 1; i < t.segments.length - 1; i++) {
                    t.fixedPath = t.fixedPath.concat(t.segments[i].slice.geometry.getCoordinates());
                }
                t.path.geometry.setCoordinates(t.segments.length >= 2
                    ? t.fixedPath.concat(t.segments[t.segments.length - 1].slice.geometry.getCoordinates())
                    : t.fixedPath);
            } else {
                t.reset();
            }
        }
    });
}

WWMapMeasurementTool.prototype.createSlice = function (coords) {
    return slice = new ymaps.Polyline(coords, {}, {
        strokeColor: "#FF0000",
        strokeWidth: 3
    });
};

WWMapMeasurementTool.prototype.createMarker = function () {
    return new ymaps.Placemark(this.pos, {
        iconContent: ""
    }, {
        preset: 'islands#redStretchyIcon',
    });
};

WWMapMeasurementTool.prototype.enable = function () {
    let t = this;
    this.segments.forEach(function (m) {
        t.map.geoObjects.add(m.marker);
    });
    t.map.geoObjects.add(t.path);
    this.enabled = true;
    this.onViewportChanged();
};

WWMapMeasurementTool.prototype.disable = function () {
    let t = this;
    this.segments.forEach(function (m) {
        t.map.geoObjects.remove(m.marker);
    });
    this.map.geoObjects.remove(this.path);
    this.enabled = false;
};

WWMapMeasurementTool.prototype.nextSegment = function () {
    let t = this;
    let marker = this.createMarker();
    marker.properties.set("iconContent", this.distanceText(this.distance));
    marker.events.add('click', function () {
        t.nextSegment();
    });
    marker.events.add('click', function (e) {
        t.mouseToCoords(e.get('position'))
    });

    if (this.segments.length > 1) {
        this.fixedPath = this.fixedPath.concat(this.segments[this.segments.length - 1].slice.geometry.getCoordinates());
        this.path.geometry.setCoordinates(this.fixedPath);
        this.addIfMissing(this.path);
    } else {
        this.map.geoObjects.remove(this.path);
    }

    let slice = this.createSlice([this.pos, this.pos]);
    this.segments.push({
        marker: marker,
        slice: slice,
        lineId: 0,
    });
    this.map.geoObjects.add(marker);
};


WWMapMeasurementTool.prototype.reset = function () {
    let t = this;
    this.segments.forEach(function (m) {
        t.map.geoObjects.remove(m.marker);
    });
    this.segments = [{
        marker: new ymaps.Placemark(this.pos, {}, {
            preset: 'islands#redIcon',
        }),
        slice: null,
        lineId: 0,
    }];
    if (this.enabled) {
        this.map.geoObjects.add(this.segments[0].marker);
    }
    this.fixedPath = [];
};

WWMapMeasurementTool.prototype.onViewportChanged = function () {
    if (!this.enabled) {
        return;
    }

    let allObs = this.objectManager.objects.getAll();
    let riverTracks = Array();
    for (let i = 0; i < allObs.length; i++) {
        if (allObs[i]
            && allObs[i].geometry && allObs[i].geometry.type == "LineString"
            && allObs[i].options && allObs[i].options.overlay != "BiPlacemarkOverlay") {
            riverTracks.push(allObs[i]);
        }
    }
    this.riverTracks = riverTracks;
};

WWMapMeasurementTool.prototype.onMouseMoved = function (pixelPos) {
    if (this.riverTracks.length == 0 && !(this.segments.length > 0 && this.currentLine) || !this.enabled) {
        return
    }

    let cursorPos = this.mouseToCoords(pixelPos);

    let nearestRiver = this.currentLine;
    let minDst = nearestRiver
        ? turf.pointToLineDistance(cursorPos, nearestRiver, {units: 'meters'})
        : Number.MAX_SAFE_INTEGER;
    for (let i = 0; i < this.riverTracks.length; i++) {
        let dst = turf.pointToLineDistance(cursorPos, this.riverTracks[i].geometry, {units: 'meters'});
        if (minDst > dst) {
            minDst = dst;
            nearestRiver = this.riverTracks[i];
        }
    }
    this.currentLine = nearestRiver;

    let nearestPoint = turf.nearestPointOnLine(nearestRiver.geometry, cursorPos, {units: 'meters'});

    this.pos = nearestPoint.geometry.coordinates;

    let segment = this.segments[this.segments.length - 1];
    let marker = segment.marker;
    marker.geometry.setCoordinates(this.pos);
    segment.lineId = nearestRiver.id;

    if (this.segments.length > 1) {
        let prevSegment = this.segments[this.segments.length - 2];
        let prevmarker = prevSegment.marker;
        let lastSegmentGeom = prevSegment.lineId == nearestRiver.id
            ? turf.lineSlice(turf.point(prevmarker.geometry.getCoordinates()), nearestPoint.geometry, nearestRiver.geometry)
            : turf.lineString([prevmarker.geometry.getCoordinates(), this.pos]);

        let lastSegmentGeomCoords = lastSegmentGeom.geometry.coordinates;
        let firstP = lastSegmentGeomCoords[0];
        let lastP = lastSegmentGeomCoords[lastSegmentGeomCoords.length - 1];
        if (turf.distance(firstP, this.pos, {units: 'meters'}) < turf.distance(lastP, this.pos, {units: 'meters'})) {
            lastSegmentGeomCoords = lastSegmentGeomCoords.reverse();
        }

        segment.slice.geometry.setCoordinates(lastSegmentGeomCoords);

        let dist = 0;

        this.segments.forEach(function (s) {
            if (s.slice) {
                dist += turf.length(turf.lineString(s.slice.geometry.getCoordinates()), {units: 'meters'});
            }
        });

        this.path.geometry.setCoordinates(this.fixedPath.concat(lastSegmentGeomCoords));
        this.addIfMissing(this.path);
        this.distance = dist;
        marker.properties.set("iconContent", this.distanceText(this.distance));
    }

    this.currentLine = nearestRiver;
};

WWMapMeasurementTool.prototype.addIfMissing = function (geoObject) {
    if (this.map.geoObjects.indexOf(geoObject) < 0) {
        this.map.geoObjects.add(geoObject);
    }
};

WWMapMeasurementTool.prototype.distanceText = function (lenMeters) {
    let distanceText;
    if (lenMeters < 1000) {
        distanceText = "" + lenMeters.toFixed(0) + "m";
    } else {
        distanceText = "" + (lenMeters / 1000).toFixed(2) + "km";
    }
    return distanceText;
};

WWMapMeasurementTool.prototype.mouseToCoords = function (pixelPos) {
    let globalPxPos = this.map.converter.pageToGlobal(pixelPos);
    return this.map.options.get('projection').fromGlobalPixels(globalPxPos, this.map.getZoom());
};
