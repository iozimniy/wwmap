package handler

import (
	"net/http"
	. "github.com/and-hom/wwmap/lib/http"
	. "github.com/and-hom/wwmap/lib/handler"
	"github.com/and-hom/wwmap/lib/dao"
	"encoding/json"
	"github.com/and-hom/wwmap/backend/passport"
	"github.com/gorilla/mux"
	"strconv"
	"io/ioutil"
	"fmt"
)

type UserInfoHandler struct {
	App
}

type UserInfoDto struct {
	AuthProvider dao.AuthProvider `json:"auth_provider"`
	Login        string `json:"login"`
	FirstName    string `json:"first_name"`
	LastName     string `json:"last_name"`
	Roles        []dao.Role `json:"roles"`
}

func (this *UserInfoHandler) Init(r *mux.Router) {
	this.Register(r, "/user-info", HandlerFunctions{Get: this.GetUserInfo})
	this.Register(r, "/auth-test", HandlerFunctions{Get: this.TestAuth})
	this.Register(r, "/user", HandlerFunctions{Get: this.ListUsers})
	this.Register(r, "/user/{userId}/role", HandlerFunctions{Post: this.SetRole})
	this.Register(r, "/vk/token", HandlerFunctions{Get: this.GetVkToken})
}

func (this *UserInfoHandler) GetUserInfo(w http.ResponseWriter, r *http.Request) {
	err := this.CreateMissingUser(r)
	if err != nil {
		onPassportErr(err, w, "Can not create user")
		return
	}

	p, info, err := this.App.GetUserInfo(r)
	if err != nil {
		onPassportErr(err, w, "Can not do request to Yandex Passport")
		return
	}

	role, err := this.UserDao.GetRole(p, info.Id)
	if err != nil {
		onPassportErr(err, w, "Can not get role for user")
		return
	}

	infoDto := UserInfoDto{
		FirstName:info.FirstName,
		LastName:info.LastName,
		Login:info.Login,
		Roles:[]dao.Role{role},
		AuthProvider: p,
	}

	bytes, err := json.Marshal(infoDto)
	if err != nil {
		OnError500(w, err, "Can not create response")
		return
	}
	w.Write(bytes)
}

func (this *UserInfoHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	if !this.CheckRoleAllowedAndMakeResponse(w, r, dao.ADMIN) {
		return
	}

	users, err := this.UserDao.List()
	if err != nil {
		OnError500(w, err, "Can not list users")
		return
	}

	this.JsonAnswer(w, users)
}

func (this *UserInfoHandler) SetRole(w http.ResponseWriter, r *http.Request) {
	if !this.CheckRoleAllowedAndMakeResponse(w, r, dao.ADMIN) {
		return
	}

	pathParams := mux.Vars(r)
	userId, err := strconv.ParseInt(pathParams["userId"], 10, 64)
	if err != nil {
		OnError(w, err, "Can not parse id", http.StatusBadRequest)
		return
	}

	bodyBytes, err := ioutil.ReadAll(r.Body)
	if err != nil {
		OnError500(w, err, "Can not read body")
		return
	}
	roleStr := ""
	json.Unmarshal(bodyBytes, &roleStr)
	if err != nil {
		OnError500(w, err, "Can not unmarshall role: " + string(bodyBytes))
		return
	}

	if roleStr != string(dao.ADMIN) && roleStr != string(dao.EDITOR) && roleStr != string(dao.USER) {
		OnError(w, err, "Can not set role " + roleStr, http.StatusBadRequest)
		return
	}
	err = this.UserDao.SetRole(userId, dao.Role(roleStr))
	if err != nil {
		OnError500(w, err, "Can not set role")
		return
	}

	users, err := this.UserDao.List()
	if err != nil {
		OnError500(w, err, "Can not list users")
		return
	}

	this.JsonAnswer(w, users)
}

func (this *UserInfoHandler) TestAuth(w http.ResponseWriter, r *http.Request) {
	found, err := this.CheckRoleAllowed(r, dao.ADMIN)
	if err != nil {
		onPassportErr(err, w, "Can not do request to Yandex Passport")
		return
	}
	if !found {
		OnError(w, nil, "User not found", http.StatusUnauthorized)
	}
}

func onPassportErr(err error, w http.ResponseWriter, msg string) {
	switch err.(type) {
	case passport.UnauthorizedError:
		OnError(w, nil, "User not found", http.StatusUnauthorized)
	default:
		OnError500(w, err, msg)
	}
}

type VkTokenAnswer struct {
	AccessToken string `json:"access_token"`
	Expires     int `json:"expires_in"`
	Uid         int64 `json:"uid"`
	ErrDesc     string `json:"error_description"`
}

func (this *UserInfoHandler) GetVkToken(w http.ResponseWriter, r *http.Request) {
	code := r.FormValue("code")
	resp, err := http.Get("https://oauth.vk.com/access_token?client_id=6703809&client_secret=Q3pUfqqJT77ZbWCyzw5Q&redirect_uri=https://wwmap.ru/redirector-vk.htm&code=" + code)
	if err != nil {
		OnError500(w, err, "Can not get token")
		return
	}
	defer resp.Body.Close()

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		OnError500(w, err, "Can not get token")
		return
	}

	answer := VkTokenAnswer{}
	err = json.Unmarshal(body, &answer)
	if err != nil {
		OnError500(w, err, fmt.Sprintf("Can not parse VK response: %s", string(body)))
		return
	}

	if (answer.AccessToken == "") {
		OnError(w, nil, answer.ErrDesc, http.StatusUnauthorized)
	}

	rb, err := json.Marshal(answer.AccessToken)
	if err != nil {
		OnError500(w, err, "Can not marshal response")
		return
	}

	w.Write(rb)
}