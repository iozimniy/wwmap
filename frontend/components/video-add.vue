<template>
    <div>
        <div>
            <label for="video_url" style="padding-right: 10px;">Ссылка на видео с youtube (как в браузере)</label><input id="video_url" type="text" style="width:400px;"/>
            <input type="button" class="btn btn-success" value="Добавить" v-on:click.prevent="onAddVideo"/>
        </div>

        <table class="table">
            <tr v-for="image in images">
                <td style="width: 1px;">
                    <iframe width="560" height="315"
                            :src="embeddedVideoUrl(image.remote_id)"
                            frameborder="0"
                            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                            allowfullscreen></iframe>
                </td>
                <td>
                    <button v-if="image.enabled===false" v-on:click="setImgEnabled(true, image.id)"
                            class="btn btn-success">Показывать
                    </button>
                    <button v-if="image.enabled===true" v-on:click="setImgEnabled(false, image.id)"
                            class="btn btn-secondary">Не показывать
                    </button>
                    <ask :id="'del-video-' + image.id" title="Точно?" msg="Удалить видео?"
                         :ok-fn="function() { removeImage(image.id); }"></ask>
                    <button data-toggle="modal" :data-target="'#del-video-' + image.id" class="btn btn-danger">
                        Удалить
                    </button>
                    <div style="margin-top: 20px;">
                        <log-dropdown object-type="IMAGE" :object-id="image.id"/>
                    </div>
                </td>
            </tr>
        </table>
    </div>
</template>

<script>
    module.exports = {
        props: ['spot', 'images', 'type', 'auth'],
        computed: {
            headers: function () {
                if (this.auth) {
                    return {
                        Authorization: getWwmapSessionId()
                    }
                }
                return {}
            }
        },
        data: function () {
            return {
                removeImage: function (imgId) {
                    this.images = removeImage(this.spot.id, imgId, this.type);
                },
                setImgEnabled: function (enabled, imgId) {
                    this.images = setImageEnabled(this.spot.id, imgId, enabled, this.type);
                },
                imageClass: function (image) {
                    if (image.enabled === false) {
                        return "wwmap-img-disabled"
                    }
                    return ""
                },
                embeddedVideoUrl: function (id) {
                    return "https://www.youtube.com/embed/" + id
                },
                uploadPath: function () {
                    return backendApiBase + "/spot/" + this.spot.id + "/img_ext?type=" + this.type
                },
                onAddVideo: function () {
                    try {
                        var videoUrl = $("#video_url").val();
                        if (!videoUrl) {
                            throw "Пустая ссылка на видео"
                        }
                        var url = document.createElement('a');
                        url.href = videoUrl;
                        if (!url.search) {
                            throw "В ссылке отсутствуют GET-параметры. Попробуйте ещё раз скопировать ссылку из адресной браузера"
                        }
                        var params = parseParams(url.search.substr(1));
                        var videoId = params["v"];
                        if (!videoId) {
                            throw "В ссылке отсутствует параметр v. Попробуйте ещё раз скопировать ссылку из адресной браузера"
                        }
                        var requestData = {
                            id: videoId,
                            type: "video",
                            source: "youtube"
                        };
                        var t = this;
                        resp = doPostJsonSync(this.uploadPath(), requestData, true);
                        if (resp) {
                            t.images = getImages(this.spot.id, "video");
                            t.hideError();
                        } else {
                            t.showError("Не удалось добавить видео")
                        }
                    } catch (e) {
                        this.showError("Не удалось добавить видео: " + e)
                    }
                },
                showError: function (errMsg) {
                    app.errMsg = errMsg
                },
                hideError: function () {
                    app.errMsg = null
                }
            }
        }
    }

</script>