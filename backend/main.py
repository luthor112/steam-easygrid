import Millennium, PluginUtils # type: ignore
logger = PluginUtils.Logger()

import base64
import json
import os
import requests
import shutil

type_dict = {
    0: "grids",
    1: "heroes",
    2: "logos",
    3: "icons"
}

game_db = {
    "overrides": {},
    "games": {}
}

########
# UTIL #
########

def get_config_fname():
    return os.path.join(PLUGIN_BASE_DIR, "config.json")

def get_cache_dir():
    return os.path.join(PLUGIN_BASE_DIR, "artcache")

def get_game_db_fname():
    return os.path.join(PLUGIN_BASE_DIR, "game_db.json")

def get_config():
    with open(get_config_fname(), "rt") as fp:
        return json.load(fp)

def load_game_db():
    if os.path.exists(get_game_db_fname()):
        with open(get_game_db_fname(), "rt") as fp:
            game_db = json.load(fp)

def save_game_db():
    with open(get_game_db_fname(), "wt") as fp:
        json.dump(game_db, fp)

def get_encoded_image(fname):
    with open(fname, "rb") as fp:
        return base64.standard_b64encode(fp.read()).decode()

###########
# DB UTIL #
###########

def get_current_image_num(app_id, image_type):
    app_id_str = str(app_id)
    if app_id_str in game_db["games"]:
        ckey = f"current_{type_dict[image_type]}"
        if ckey in game_db["games"][app_id_str]:
            return game_db["games"][app_id_str][ckey]
    return -1

################
# SGDB INTEROP #
################

def get_sgdb_id(app_name, app_id):
    logger.log(f"get_sgdb_id(): Searching for app {app_name} with ID {app_id}")
    app_id_str = str(app_id)
    sgdb_id = None
    headers = {"Authorization": f"Bearer {get_config()['api_key']}"}

    games_response = requests.get(f"https://www.steamgriddb.com/api/v2/games/steam/{app_id}", headers=headers)
    if games_response.status_code == 200:
        data = games_response.json()
        if data["success"]:
            sgdb_id = data["data"]["id"]
        else:
            logger.log("get_sgdb_id(): Unsuccessful - 'success' is false")
    else:
        logger.log(f"get_sgdb_id(): Unsuccessful - HTTP {games_response.status_code}")

    if sgdb_id is not None:
        logger.log(f"get_sgdb_id(): App found as {sgdb_id}")
        return sgdb_id

    fallback_enabled = get_config()["display_name_fallback"]
    if not fallback_enabled:
        logger.log("get_sgdb_id(): Fallback disabled")
        return None

    search_response = requests.get(f"https://www.steamgriddb.com/api/v2/search/autocomplete/{app_name}", headers=headers)
    if search_response.status_code == 200:
        data = search_response.json()
        if data["success"] and len(data["data"]) > 0:
            sgdb_id = data["data"][0]["id"]
        else:
            logger.log("get_sgdb_id(): Unsuccessful - 'success' is false or no data")
    else:
        logger.log(f"get_sgdb_id(): Unsuccessful - HTTP {search_response.status_code}")

    if sgdb_id is not None:
        logger.log(f"get_sgdb_id(): App found as {sgdb_id}")
        return sgdb_id

    return None

def get_cached_file(app_name, app_id, image_type, image_num, set_current):
    logger.log(f"get_cached_file(): Searching for type {image_type} for app {app_id} with index {image_num}")
    app_id_str = str(app_id)
    sgdb_id = None

    if app_id_str in game_db["overrides"]:
        sgdb_id = game_db["overrides"][app_id_str]
    else:
        sgdb_id = get_sgdb_id(app_name, app_id)
        if sgdb_id is None:
            logger.log("get_cached_file(): Cannot find GameID")
            return None
        else:
            game_db["overrides"][str(app_id)] = sgdb_id
            save_game_db()

    if app_id_str not in game_db["games"]:
        game_db["games"][app_id_str] = {}

    if type_dict[image_type] not in game_db["games"][app_id_str]:
        logger.log(f"get_cached_file(): No URLs cached for type {image_type} for app {app_id}")
        url_list = []

        headers = {"Authorization": f"Bearer {get_config()['api_key']}"}
        query_param = get_config()["extra_config"]
        response = requests.get(f"https://www.steamgriddb.com/api/v2/{type_dict[image_type]}/game/{sgdb_id}", params=query_param, headers=headers)

        if response.status_code == 200:
            data = response.json()
            if data["success"] and len(data["data"]) > 0:
                for i in range(len(data["data"])):
                    url_list.append(data["data"][i]["url"])
            else:
                logger.log("get_cached_file(): Unsuccessful - 'success' is false or no data")
        else:
            logger.log(f"get_cached_file(): Unsuccessful - HTTP {response.status_code}")

        if len(url_list) > 0:
            game_db["games"][app_id_str][type_dict[image_type]] = url_list
            save_game_db()
        else:
            logger.log("get_cached_file(): No URLs found")
            return None

    if image_num < 0 or image_num >= len(game_db["games"][app_id_str][type_dict[image_type]]):
        logger.log(f"get_cached_file(): Invalid index {image_num}")
        return None

    image_url = game_db["games"][app_id_str][type_dict[image_type]][image_num]
    logger.log(f"get_cached_file(): Image URL is {image_url}")

    ftype = ""
    if "." in image_url:
        ftype = image_url[image_url.rfind(".")+1:]
    logger.log(f"get_cached_file(): Image filetype is {ftype}")
    fname = os.path.join(get_cache_dir(), f"{app_id}_{image_type}_{image_num}.{ftype}")
    if not os.path.exists(fname):
        logger.log("get_cached_file(): Downloading...")
        with requests.get(image_url, stream=True) as r:
            with open(fname, "wb") as f:
                shutil.copyfileobj(r.raw, f)

    if set_current:
        ckey = f"current_{type_dict[image_type]}"
        game_db["games"][app_id_str][ckey] = image_num
        save_game_db()

    logger.log(f"get_cached_file() -> {fname}")
    return f"{ftype};{get_encoded_image(fname)}"

##############
# INTERFACES #
##############

class Backend:
    @staticmethod
    def get_image(app_name, app_id, image_type, image_num, set_current):
        logger.log(f"get_image() called for app {app_name} with ID {app_id} and type {image_type} and index {image_num}")
        cached_file = get_cached_file(app_name, app_id, image_type, image_num, set_current)

        if cached_file is not None:
            logger.log("get_image() -> Image exists, returning encoded data")
            return cached_file
        else:
            logger.log("get_image() -> Image not found")
            return ""

    @staticmethod
    def get_current_index(app_id, image_type):
        current_num = get_current_image_num(app_id, image_type)
        logger.log(f"get_current_index() -> {current_num}")
        return current_num

class Plugin:
    def _front_end_loaded(self):
        logger.log("Frontend loaded")

    def _load(self):
        logger.log(f"Plugin base dir: {PLUGIN_BASE_DIR}")

        cache_dir = get_cache_dir()
        if not os.path.exists(cache_dir):
            logger.log("Creating cache dir...")
            os.mkdir(cache_dir)
        logger.log(f"Cache dir: {cache_dir}")

        load_game_db()
        logger.log("Database loaded")

        logger.log("Backend loaded")
        Millennium.ready()

    def _unload(self):
        save_game_db()
        logger.log("Database saved")
        logger.log("Unloading")
