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
                if(measurementTool.enabled) {
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
        t.nextSegment();
    });

    $(document).keyup(function (e) {
        if (e.key === "Escape") {
            t.removeLastSegment();
        }
    });
}

WWMapMeasurementTool.prototype.removeLastSegment = function () {
    if (this.segments.length > 1) {
        let lastSegment = this.segments[this.segments.length - 1];
        let prevSegment = this.segments[this.segments.length - 2];
        this.segments.splice(-1, 1);
        this.map.geoObjects.remove(lastSegment.marker);
        this.pos = prevSegment.marker.geometry.coordinates;

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
        // lineStringOverlay: "RullerLineOverlay",
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

WWMapMeasurementTool.prototype.nextSegment = function () {
    let t = this;
    let marker = this.createMarker();
    marker.properties.set("iconContent", this.distanceText(this.distance));
    marker.events.add('click', function () {
        t.nextSegment();
    });
    marker.events.add('contextmenu', function (e) {
        t.showHideLastMarker();
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
    this.trackStorage.setBounds(this.map.getBounds(), this.map.getZoom());
};

sensitivity_px = 2;

WWMapMeasurementTool.prototype.onMouseMoved = function (pixelPos) {
    if (!this.showLastMarker || !this.enabled || this.trackStorage.rivers.length == 0 && !(this.segments.length > 0 && this.currentLine)) {
        return
    }

    if (this.pixelPos && (
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
    for (let i = 0; i < this.trackStorage.rivers.length; i++) {
        let dst = turf.pointToLineDistance(cursorPosFlipped, turf.lineString(this.trackStorage.rivers[i].path), {units: 'meters'});
        if (minDst > dst) {
            minDst = dst;
            nearestRiver = this.trackStorage.rivers[i];
        }
    }
    this.currentLine = nearestRiver;

    let nearestRiverLineString = turf.lineString(nearestRiver.path);
    let nearestPointFlipped = turf.nearestPointOnLine(nearestRiverLineString, cursorPosFlipped, {units: 'meters'});

    this.pos = flip(nearestPointFlipped.geometry.coordinates);

    let segment = this.segments[this.segments.length - 1];
    let marker = segment.marker;
    marker.geometry.setCoordinates(this.pos);
    segment.lineId = nearestRiver.id;

    if (this.segments.length > 1) {
        let prevSegment = this.segments[this.segments.length - 2];
        let prevmarker = prevSegment.marker;
        let lastSegmentGeom = turf.flip(prevSegment.lineId == nearestRiver.id
            ? turf.lineSlice(turf.flip(turf.point(prevmarker.geometry.getCoordinates())), nearestPointFlipped.geometry, nearestRiverLineString)
            : turf.lineString([flip(prevmarker.geometry.getCoordinates()), nearestPointFlipped.geometry.coordinates]));

        let lastSegmentGeomCoords = lastSegmentGeom.geometry.coordinates;
        let firstP = lastSegmentGeomCoords[0];
        let lastP = lastSegmentGeomCoords[lastSegmentGeomCoords.length - 1];
        if (turf.distance(flip(firstP), nearestPointFlipped.geometry.coordinates, {units: 'meters'}) < turf.distance(flip(lastP), nearestPointFlipped.geometry.coordinates, {units: 'meters'})) {
            lastSegmentGeomCoords = lastSegmentGeomCoords.reverse();
        }

        let lastSegmentCoordsFlipped = flipLine(lastSegmentGeomCoords);
        console.log(lastSegmentGeomCoords, lastSegmentCoordsFlipped)
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

/*
ymaps.modules.define("overlay.RullerLine", [
    'overlay.Polyline',
    'overlay.Circle',
    'util.extend',
    'event.Manager',
    'option.Manager',
    'Event',
    'geometry.pixel.LineString',
    'geometry.pixel.Circle'
], function (provide, PolylineOverlay, CircleOverlay, extend, EventManager, OptionManager, Event, PolylineGeometry, CircleGeometry) {
    var domEvents = [
            'click',
            'contextmenu',
            'dblclick',
            'mousedown',
            'mouseenter',
            'mouseleave',
            'mousemove',
            'mouseup',
            'multitouchend',
            'multitouchmove',
            'multitouchstart',
            'wheel'
        ],

        RullerLineOverlay = function (pixelGeometry, data, options) {
            this.events = new EventManager();
            this.options = new OptionManager(options);
            this._map = null;
            this._data = data;
            this._geometry = pixelGeometry;
            this._line = null;
            this._labels = null;
        };

    RullerLineOverlay.prototype = extend(RullerLineOverlay.prototype, {
        getData: function () {
            return this._data;
        },

        setData: function (data) {
            if (this._data != data) {
                var oldData = this._data;
                this._data = data;
                this.events.fire('datachange', {
                    oldData: oldData,
                    newData: data
                });
            }
        },

        getMap: function () {
            return this._map;
        },

        setMap: function (map) {
            if (this._map != map) {
                var oldMap = this._map;
                if (!map) {
                    this._onRemoveFromMap();
                }
                this._map = map;
                if (map) {
                    this._onAddToMap();
                }
                this.events.fire('mapchange', {
                    oldMap: oldMap,
                    newMap: map
                });
            }
        },

        setGeometry: function (geometry) {
            if (this._geometry != geometry) {
                var oldGeometry = geometry;
                this._geometry = geometry;

                if (this.getMap() && geometry) {
                    this._rebuild();
                }
                this.events.fire('geometrychange', {
                    oldGeometry: oldGeometry,
                    newGeometry: geometry
                });
            }
        },

        getGeometry: function () {
            return this._geometry;
        },

        getShape: function () {
            return null;
        },

        isEmpty: function () {
            return false;
        },

        _rebuild: function () {
            this._onRemoveFromMap();
            this._onAddToMap();
        },

        _onAddToMap: function () {
            let path = this.getGeometry().getCoordinates();

            let geoPath = this.getData().geometry.getCoordinates();
            let pathLineString = turf.flip(turf.lineString(geoPath));
            let lengthMeters = turf.length(pathLineString, {units: 'meters'});

            if (lengthMeters == 0) {
                return;
            }
            let map = this.getMap();

            this._line = new PolylineOverlay(new PolylineGeometry(path));
            this._startOverlayListening();

            this._line.options.set("strokeWidth", 3);
            this._line.options.set("fill", false);

            this._line.options.setParent(this.options);
            this._line.setMap(map);

            this._labels = [];
            let p = path[0];
            let label0 = new CircleOverlay(new CircleGeometry(p, 4));

            label0.options.setParent(this.options);
            label0.setMap(map);

            this._labels.push(label0);
            for (let i = 1; i < lengthMeters / 1000; i++) {
                let p_i = turf.flip(turf.along(pathLineString, i * 1000, {units: 'meters'}));
                let p_i_coords = p_i.geometry.coordinates;
                let p_i_pixel_coords = map.options.get('projection').toGlobalPixels(p_i_coords, map.getZoom());
                let label = new CircleOverlay(new CircleGeometry(p_i_pixel_coords, 4));

                label.options.setParent(this.options);
                label.setMap(map);

                this._labels.push(label);
            }
        },

        _onRemoveFromMap: function () {
            if (this._line) {
                this._line.setMap(null);
                this._line.options.setParent(null);
            }
            if (this._labels) {
                this._labels.forEach(function (label) {
                    label.setMap(null);
                    label.options.setParent(null);
                })
            }
            this._stopOverlayListening();
        },

        _startOverlayListening: function () {
            if (this._line) {
                this._line.events.add(domEvents, this._onDomEvent, this);
            }
            if (this._labels) {
                let t = this;
                this._labels.forEach(function (label) {
                    label.events.add(domEvents, t._onDomEvent, t);
                })
            }
        },

        _stopOverlayListening: function () {
            if (this._line) {
                this._line.events.remove(domEvents, this._onDomEvent, this);
            }
            if (this._labels) {
                let t = this;
                this._labels.forEach(function (label) {
                    label.events.remove(domEvents, t._onDomEvent, t);
                })
            }
        },

        _onDomEvent: function (e) {
            this.events.fire(e.get('type'), new Event({target: this}, e));
        },

    });

    provide(RullerLineOverlay);
});

*/