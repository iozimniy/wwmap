function createMeasurementToolControl(measurementTool) {
    Legend = function (options) {
        Legend.superclass.constructor.call(this, options);
        this._$content = null;
        this._geocoderDeferred = null;
    };

    ymaps.util.augment(Legend, ymaps.collection.Item, {
        onAddToMap: function (map) {
            Legend.superclass.onAddToMap.call(this, map);
            this._lastCenter = null;
            this.getParent().getChildElement(this).then(this._onGetChildElement, this);
        },

        onRemoveFromMap: function (oldMap) {
            this._lastCenter = null;
            if (this._$content) {
                this._$content.remove();
                this._mapEventGroup.removeAll();
            }
            Legend.superclass.onRemoveFromMap.call(this, oldMap);
        },

        _onGetChildElement: function (parentDomContainer) {
            // Создаем HTML-элемент с текстом.
            var content = '<div class="wwmap-route-control">' +
                '<button class="ymaps-2-1-73-float-button-text, wwmap-measure-btn">Расстояния по воде<img style="height:24px"/></button>' +
                '<button class="ymaps-2-1-73-float-button-text, wwmap-measure-download-btn" style="display: none;" title="Скачать GPX"><img style="height:24px" src="img/download.png"/></button>' +
                '<button class="ymaps-2-1-73-float-button-text, wwmap-measure-revert-btn" style="display: none;" title="Удалить последнюю точку"><img style="height:24px" src="img/revert.png"/></button>' +
                '<button class="ymaps-2-1-73-float-button-text, wwmap-measure-delete-btn" style="display: none;" title="Очистить трек"><img style="height:24px" src="img/del.png"/></button>' +
                '</div>';
            this._$content = $(content).appendTo(parentDomContainer);

            var measureOnOffBtn = $('.wwmap-measure-btn');
            var measureDownloadBtn = $('.wwmap-measure-download-btn');
            var measureRevertBtn = $('.wwmap-measure-revert-btn');
            var measureDeleteBtn = $('.wwmap-measure-delete-btn');
            var t = this;
            measureOnOffBtn.bind('click', function (e) {
                if (measurementTool.enabled) {
                    measureOnOffBtn.removeClass("wwmap-measure-btn-pressed");
                    measurementTool.disable();
                    measureDownloadBtn.css('display', 'none');
                    measureRevertBtn.css('display', 'none');
                    measureDeleteBtn.css('display', 'none');
                } else {
                    measureOnOffBtn.addClass("wwmap-measure-btn-pressed");
                    measurementTool.enable();
                    measureDownloadBtn.css('display', 'inline-block');
                    measureRevertBtn.css('display', 'inline-block');
                    measureDeleteBtn.css('display', 'inline-block');
                }
            });

            measureDownloadBtn.bind('click', function (e) {
                alert('Not implemented')
            });

            measureRevertBtn.bind('click', function (e) {
                measurementTool.removeLastSegment();
            });

            measureDeleteBtn.bind('click', function (e) {
                measurementTool.reset();
            });
        },

        onDragStart: function (e) {
            this.drag = true
        },
        onDragStop: function (e) {
            this.drag = false
        },
        onDrag: function (e) {
            if (this.drag) {
                this.onFilterStateChanged(e)
            }
        },
        onFilterStateChanged: function (e) {
            var category = $(e.target)
                .attr("class")
                .split(' ')
                .filter(function (c) {
                    return c.startsWith('cat')
                })
                .map(function (value) {
                    return parseInt(value.substring(3))
                })[0];
            if (!category || category === wwmap.catFilter) {
                return
            }
            for (var i = 1; i <= 6; i++) {
                if (i < category) {
                    $('.wwmap-legend .cat' + i).removeClass("cat-bold")
                } else {
                    $('.wwmap-legend .cat' + i).addClass("cat-bold")
                }
            }
            wwmap.catFilter = category;
            wwmap.objectManager.reloadData();
            wwmap.loadRivers(wwmap.yMap.getBounds())
        }
    });

    return new Legend()
}


function WWMapMeasurementTool(map, objectManager, apiBase) {
    this.trackStorage = new TrackStorage(apiBase);

    this.map = map;
    this.objectManager = objectManager;
    this.segments = [];

    this.pos = map.getCenter();
    this.distance = 0;

    this.fixedPath = [];
    this.path = this.createSlice([this.pos, this.pos]);

    this.showLastMarker = true;

    let t = this;

    this.reset();
    this.segments[0].marker.events.add('click', function () {
        t.pushEmptySegment();
    });

    $(document).keyup(function (e) {
        if (e.key === "Escape") {
            t.removeLastSegment();
        }
    });
}

WWMapMeasurementTool.prototype.removeLastSegment = function (n) {
    if (!n) {
        n = 1;
    }
    if (this.segments.length > 1) {
        let prevSegment = this.segments[this.segments.length - n - 1];
        for (i = 0; i < n; i++) {
            this.map.geoObjects.remove(this.segments[this.segments.length - i - 1].marker);
        }
        this.pos = prevSegment.marker.geometry.coordinates;
        this.segments.splice(-n, n);

        this.fixedPath = [];
        for (let i = 1; i < this.segments.length - 1; i++) {
            this.fixedPath = this.fixedPath.concat(this.segments[i].slice.geometry.getCoordinates());
        }
        this.path.geometry.setCoordinates(this.segments.length >= 2
            ? this.fixedPath.concat(this.segments[this.segments.length - 1].slice.geometry.getCoordinates())
            : this.fixedPath);
    } else {
        this.reset();
    }
};

WWMapMeasurementTool.prototype.createSlice = function (coords) {
    return slice = new ymaps.Polyline(coords, {}, {
        strokeColor: "#FF0000",
        strokeWidth: 5,
    });
};

WWMapMeasurementTool.prototype.createMarker = function (text) {
    let marker = new ymaps.Placemark(this.pos, {
        iconContent: ""
    }, {
        preset: 'islands#redStretchyIcon',
    });
    let t = this;
    marker.events.add('click', function () {
        t.pushEmptySegment();
    });
    marker.events.add('contextmenu', function (e) {
        t.showHideLastMarker();
    });
    marker.events.add('mousemove', function (e) {
        t.mouseToCoords(e.get('position'));
    });
    marker.properties.set("iconContent", text);
    return marker;
};

WWMapMeasurementTool.prototype.enable = function () {
    let t = this;
    this.segments.forEach(function (m) {
        t.map.geoObjects.add(m.marker);
    });
    if (!this.showLastMarker && this.segments.length > 1) {
        this.map.geoObjects.remove(this.segments[this.segments.length - 1].marker);
    }
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

WWMapMeasurementTool.prototype.showHideLastMarker = function () {

    if (this.showLastMarker) {
        if (this.segments.length > 1) {
            this.map.geoObjects.remove(this.segments[this.segments.length - 1].marker);
            this.path.geometry.setCoordinates(this.fixedPath);
        }
        this.showLastMarker = false;
    } else {
        if (this.segments.length > 1) {
            this.map.geoObjects.add(this.segments[this.segments.length - 1].marker);
        }
        this.showLastMarker = true;
    }
};

WWMapMeasurementTool.prototype.pushEmptySegment = function (noMarker) {
    if (this.segments.length > 1) {
        this.fixedPath = this.fixedPath.concat(this.segments[this.segments.length - 1].slice.geometry.getCoordinates());
        this.path.geometry.setCoordinates(this.fixedPath);
        this.addIfMissing(this.path);
    } else {
        this.map.geoObjects.remove(this.path);
    }

    let marker = this.createMarker(this.distanceText(this.distance));
    let slice = this.createSlice([this.pos, this.pos]);

    let segment = {
        marker: marker,
        slice: slice,
        dist: 0,
        lineId: 0,
    };
    this.segments.push(segment);
    if (!noMarker) {
        this.map.geoObjects.add(marker);
    }
    return segment;
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
        dist: 0,
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
    this.trackStorage.setBounds(this.map.getBounds(), this.map.getZoom());
};

sensitivity_px = 2;

WWMapMeasurementTool.prototype.onMouseMoved = function (pixelPos) {
    if (!pixelPos || !this.showLastMarker || !this.enabled || this.trackStorage.rivers.length == 0 && !(this.segments.length > 0 && this.currentLine)) {
        return
    }

    if (this.pixelPos && pixelPos && (
        Math.abs(this.pixelPos[0] - pixelPos[0]) < sensitivity_px
        || Math.abs(this.pixelPos[1] - pixelPos[1]) <= sensitivity_px)) {
        return;
    }
    this.pixelPos = pixelPos;

    let cursorPosFlipped = flip(this.mouseToCoords(pixelPos));

    let nearestRiver = this.currentLine;
    let minDst = nearestRiver
        ? turf.pointToLineDistance(cursorPosFlipped, turf.lineString(nearestRiver.path), {units: 'meters'})
        : Number.MAX_SAFE_INTEGER;
    let epsilon_m = 100;
    if (!nearestRiver || minDst > epsilon_m) {
        for (let i = 0; i < this.trackStorage.rivers.length; i++) {
            let dst = turf.pointToLineDistance(cursorPosFlipped, turf.lineString(this.trackStorage.rivers[i].path), {units: 'meters'});
            if (minDst > dst) {
                minDst = dst;
                nearestRiver = this.trackStorage.rivers[i];
            }
        }
        this.currentLine = nearestRiver;
    }

    let nearestRiverLineString = turf.lineString(nearestRiver.path);
    let nearestPointFlipped = turf.nearestPointOnLine(nearestRiverLineString, cursorPosFlipped, {units: 'meters'});

    this.pos = flip(nearestPointFlipped.geometry.coordinates);

    let segment = this.segments[this.segments.length - 1];
    if (segment.lineId != nearestRiver.id && segment.lineId != 0 && this.segments.length > 1) {
        if (this.segments.length > 2
            && this.segments[this.segments.length - 1].dist < epsilon_m
            && this.segments[this.segments.length - 2].lineId != nearestRiver.id) {
            console.log("rm", this.segments[0])
            console.log("rm", this.segments[1])
            console.log("rm", this.segments[2])
            this.removeLastSegment(2);
        } else {
            let p0flipped = this.segments[this.segments.length - 2].marker.geometry.getCoordinates();
            let p1flipped = segment.marker.geometry.getCoordinates();
            let p2geom = turf.nearestPointOnLine(nearestRiverLineString, flip(p1flipped), {units: 'meters'});
            let p2 = p2geom.geometry.coordinates;
            let p2flipped = flip(p2);

            let d = turf.distance(p1flipped, p2flipped, {units: 'meters'});
            console.log(d, epsilon_m)
            if (d < epsilon_m) {
                this.map.geoObjects.remove(segment.marker);
                segment = this.pushEmptySegment(true);
                segment.slice.geometry.setCoordinates([p1flipped, p2flipped]);
                segment.lineId = nearestRiver.id;
                segment.marker.geometry.setCoordinates(p2flipped);
                this.pos = p2;

                segment = this.pushEmptySegment();
            }
        }
    }
    segment.marker.geometry.setCoordinates(this.pos);
    segment.lineId = nearestRiver.id;

    if (this.segments.length < 2) {
        return;
    }

    let prevSegment = this.segments[this.segments.length - 2];
    let prevSegmentGeom;
    if (prevSegment.lineId == nearestRiver.id) {
        let prevSegEndPoint = turf.flip(turf.point(prevSegment.marker.geometry.getCoordinates()));
        prevSegmentGeom = turf.flip(turf.lineSlice(prevSegEndPoint, nearestPointFlipped.geometry, nearestRiverLineString));
    } else {
        prevSegmentGeom = turf.flip(turf.lineString([flip(prevSegment.marker.geometry.getCoordinates()), nearestPointFlipped.geometry.coordinates]));
    }

    let currentSegmentGeomCoords = prevSegmentGeom.geometry.coordinates;
    if (turf.distance(flip(currentSegmentGeomCoords[0]), nearestPointFlipped.geometry.coordinates, {units: 'meters'}) < 1) {
        currentSegmentGeomCoords = currentSegmentGeomCoords.reverse();
    }

    segment.slice.geometry.setCoordinates(currentSegmentGeomCoords);
    segment.dist = turf.length(prevSegmentGeom, {units: 'meters'});

    let dist = this.segments.reduce(function (a, s) {
        return a + s.dist
    }, 0);

    this.path.geometry.setCoordinates(this.fixedPath.concat(currentSegmentGeomCoords));
    this.addIfMissing(this.path);
    this.distance = dist;

    segment.marker.properties.set("iconContent", this.distanceText(this.distance));

};

function flip(p) {
    return [p[1], p[0]]
}

function flipLine(arr) {
    return arr.map(flip)
}

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
