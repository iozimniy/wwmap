import {apiBase} from "./config";

export function WWMapSearchProvider() {

}

WWMapSearchProvider.prototype.geocode = function (request, options) {
    var deferred = new ymaps.vow.defer(),
        geoObjects = new ymaps.GeoObjectCollection(),
        // Сколько результатов нужно пропустить.
        offset = options.skip || 0,
        // Количество возвращаемых результатов.
        limit = options.results || 20;

    var xhr = new XMLHttpRequest();
    xhr.open("POST", apiBase + "/search", true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(request);
    xhr.onload = function (e) {
        if (xhr.readyState === 4) {
            if (xhr.status === 200) {
                var respData = JSON.parse(xhr.responseText);

                for (var i = 0, l = respData.spots.length; i < l; i++) {
                    var spot = respData.spots[i];

                    geoObjects.add(new ymaps.Placemark(spotToMediumPoint(spot), {
                        name: spot.title,
                        description: spot.river_title,
                        balloonContentBody: '<p>' + spot.title + ' (' + spot.river_title + ')' + '</p>',
                        boundedBy: spotToBounds(spot)
                    }, {
                        iconLayout: 'default#image',
                        iconImageHref: respData.resource_base + '/img/empty-px.png',
                        iconImageSize: [1, 1],
                        iconImageOffset: [-1, -1],

                        id: spot.id
                    }));
                }

                for (i = 0, l = respData.rivers.length; i < l; i++) {
                    var river = respData.rivers[i];

                    geoObjects.add(new ymaps.Placemark(center(river.bounds), {
                        name: river.title,
                        description: river.region.title,
                        balloonContentBody: '<p>' + river.title + '</p>',
                        boundedBy: river.bounds
                    }, {
                        iconLayout: 'default#image',
                        iconImageHref: respData.resource_base + '/img/empty-px.png',
                        iconImageSize: [1, 1],
                        iconImageOffset: [-1, -1],

                        id: river.id
                    }));
                }

                deferred.resolve({
                    geoObjects: geoObjects,
                    metaData: {
                        geocoder: {
                            request: request,
                            found: geoObjects.getLength(),
                            results: limit,
                            skip: offset
                        }
                    }
                });
            } else {
                throw xhr.responseText
            }
        }
    };

    return deferred.promise();
};

function spotToBounds(spot) {
    let margins = 0.003;
    if (Array.isArray(spot.point[0])) {
        let pBegin = spot.point[0];
        let pEnd = spot.point[spot.point.length - 1];

        let xMin = Math.min(pBegin[0],pEnd[0]);
        let xMax = Math.max(pBegin[0],pEnd[0]);
        let yMin = Math.min(pBegin[1],pEnd[1]);
        let yMax = Math.max(pBegin[1],pEnd[1]);

        return [[xMin, yMin], [xMax, yMax]];
    } else {
        return [addToPoint(spot.point, -margins), addToPoint(spot.point, margins)];
    }
}

function spotToMediumPoint(spot) {
    if (Array.isArray(spot.point[0])) {
        let p = [spot.point[0], spot.point[spot.point.length - 1]];
        return [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2,]
    } else {
        return spot.point;
    }
}

function addToPoint(p, x) {
    return [p[0] + x, p[1] + x]
}

function center(bounds) {
    return [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2]
}