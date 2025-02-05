import fileDownload from "js-file-download"
import {WWMapPopup} from "../popup";

export function createMeasurementToolControl(measurementTool) {
    let MeasurementControl = function (options) {
        MeasurementControl.superclass.constructor.call(this, options);
        this._$content = null;
        this._geocoderDeferred = null;
    };

    ymaps.util.augment(MeasurementControl, ymaps.collection.Item, {
        onAddToMap: function (map) {
            MeasurementControl.superclass.onAddToMap.call(this, map);
            this._lastCenter = null;
            this.getParent().getChildElement(this).then(this._onGetChildElement, this);
        },

        onRemoveFromMap: function (oldMap) {
            this._lastCenter = null;
            if (this._$content) {
                this._$content.remove();
                this._mapEventGroup.removeAll();
            }
            MeasurementControl.superclass.onRemoveFromMap.call(this, oldMap);
        },

        _onGetChildElement: function (parentDomContainer) {
            // Создаем HTML-элемент с текстом.
            var content = '<div class="wwmap-route-control">' +
                '<button class="ymaps-2-1-73-float-button-text, wwmap-measure-btn" title="Расстояние по реке"><img style="height:24px" src="http://wwmap.ru/img/ruler.png"/><img style="height:24px"/></button>' +

                '<button class="ymaps-2-1-73-float-button-text, wwmap-measure-ok-btn" style="display: none;" title="Закончить редактирование"><img style="height:24px" src="http://wwmap.ru/img/ok.png"/><img style="height:24px"/></button>' +
                '<button class="ymaps-2-1-73-float-button-text, wwmap-measure-revert-btn" style="display: none;" title="Удалить последнюю точку (Esc)"><img style="height:24px" src="http://wwmap.ru/img/revert.png"/></button>' +
                '<button class="ymaps-2-1-73-float-button-text, wwmap-measure-delete-btn" style="display: none;" title="Очистить трек"><img style="height:24px" src="http://wwmap.ru/img/del.png"/></button>' +

                '<button class="ymaps-2-1-73-float-button-text, wwmap-measure-edit-btn" style="display: none;" title="Продолжить редактирование"><img style="height:24px" src="http://wwmap.ru/img/edit.png"/></button>' +
                '<button class="ymaps-2-1-73-float-button-text, wwmap-measure-download-btn" style="display: none;" title="Скачать GPX"><img style="height:24px" src="http://wwmap.ru/img/download.png"/></button>' +
                '<button class="ymaps-2-1-73-float-button-text, wwmap-measure-help-btn" style="display: none;" title="Справка об измерении пути по реке"><img style="height:24px" src="http://wwmap.ru/img/help.png"/></button>' +
                '</div>';
            this._$content = $(content).appendTo(parentDomContainer);

            var measureOnOffBtn = $('.wwmap-measure-btn');

            var measureCompleteBtn = $('.wwmap-measure-ok-btn');
            var measureRevertBtn = $('.wwmap-measure-revert-btn');
            var measureDeleteBtn = $('.wwmap-measure-delete-btn');

            var measureDownloadBtn = $('.wwmap-measure-download-btn');
            var measureEditBtn = $('.wwmap-measure-edit-btn');

            var measureHelpBtn = $('.wwmap-measure-help-btn');

            let refreshMeasurementButtons = function () {
                let exportModeStyle = measurementTool.edit || !measurementTool.hasDrawnPath() ? 'none' : 'inline-block';
                let editModeStyle = measurementTool.edit ? 'inline-block' : 'none';

                measureDownloadBtn.css('display', exportModeStyle);
                measureEditBtn.css('display', exportModeStyle);

                measureCompleteBtn.css('display', measurementTool.edit && measurementTool.hasDrawnPath()  ? 'inline-block' : 'none');
                measureRevertBtn.css('display', editModeStyle);
                measureDeleteBtn.css('display', editModeStyle);
            };

            measureOnOffBtn.bind('click', function (e) {
                if (measurementTool.enabled) {
                    measureOnOffBtn.removeClass("wwmap-measure-btn-pressed");
                    measureOnOffBtn.attr('title', 'Расстояние по реке');
                    measurementTool.disable();

                    measureDownloadBtn.css('display', 'none');
                    measureEditBtn.css('display', 'none');

                    measureCompleteBtn.css('display', 'none');
                    measureRevertBtn.css('display', 'none');
                    measureDeleteBtn.css('display', 'none');

                    measureHelpBtn.css('display', 'none');
                } else {
                    measureOnOffBtn.addClass("wwmap-measure-btn-pressed");
                    measureOnOffBtn.attr('title', 'Выключить измерение расстояний по реке');
                    measurementTool.enable();

                    refreshMeasurementButtons();
                    measureHelpBtn.css('display', 'inline-block');
                }
            });

            measureCompleteBtn.bind('click', function (){
                measurementTool.setEditMode(false);
                refreshMeasurementButtons();
            });

            measureEditBtn.bind('click', function (){
                measurementTool.setEditMode(true);
                refreshMeasurementButtons();
            });

            measureDownloadBtn.bind('click', function (e) {
                if (measurementTool.multiPath.segmentCount() > 0) {
                    fileDownload(measurementTool.multiPath.createGpx(), "track.gpx", "application/gpx+xml");
                } else {
                    alert("Добавьте линию")
                }
            });

            measureRevertBtn.bind('click', function (e) {
                measurementTool.multiPath.removeLastSegments(1);
                refreshMeasurementButtons();
            });

            measureDeleteBtn.bind('click', function (e) {
                measurementTool.reset();
            });

            let tutorialPopup = new WWMapPopup('info_popup_measurement_template', true, 'info_popup_measurement');
            measureHelpBtn.bind('click', function (e) {
                tutorialPopup.show();
            });

            measurementTool.multiPath.onChangeSegmentCount = refreshMeasurementButtons;
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
    });

    return new MeasurementControl()
}
