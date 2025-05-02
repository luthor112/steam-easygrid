import Millennium, PluginUtils # type: ignore
logger = PluginUtils.Logger()

import base64
import glob
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
    global game_db
    if os.path.exists(get_game_db_fname()):
        with open(get_game_db_fname(), "rt") as fp:
            game_db = json.load(fp)

def save_game_db():
    global game_db
    with open(get_game_db_fname(), "wt") as fp:
        json.dump(game_db, fp)

def get_encoded_image(fname):
    with open(fname, "rb") as fp:
        return base64.standard_b64encode(fp.read()).decode()

###########
# DB UTIL #
###########

def get_current_image_num(app_id, image_type):
    global game_db
    app_id_str = str(app_id)
    if app_id_str in game_db["games"]:
        ckey = f"current_{type_dict[image_type]}"
        if ckey in game_db["games"][app_id_str]:
            return int(game_db["games"][app_id_str][ckey])
    return -1

def get_max_image_num(app_id, image_type):
    global game_db
    app_id_str = str(app_id)
    if app_id_str in game_db["games"]:
        if type_dict[image_type] in game_db["games"][app_id_str]:
            return len(game_db["games"][app_id_str][type_dict[image_type]])-1
    return -1

def delete_app_from_db(app_id):
    global game_db
    app_id_str = str(app_id)
    if app_id_str in game_db["games"]:
        del game_db["games"][app_id_str]
        save_game_db()

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
    global game_db

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
        animated_url_list = []

        headers = {"Authorization": f"Bearer {get_config()['api_key']}"}
        query_param = get_config()[f"{type_dict[image_type]}_config"]

        original_types = query_param["types"]
        query_param["types"] = "animated"
        fetch_image_urls(headers, image_type, query_param, sgdb_id, animated_url_list)
        query_param["types"] = original_types

        fetch_image_urls(headers, image_type, query_param, sgdb_id, url_list)

        final_url_list = {}
        for i, url in enumerate(url_list):
            type = "animated" if url in animated_url_list else "static"
            final_url_list[str(i)] = {"url": url, "type": type}

        if len(final_url_list) > 0:
            game_db["games"][app_id_str][type_dict[image_type]] = final_url_list
            save_game_db()
        else:
            logger.log("get_cached_file(): No URLs found")
            return None

    if image_num == -1 and set_current:
        ckey = f"current_{type_dict[image_type]}"
        game_db["games"][app_id_str][ckey] = image_num
        save_game_db()
        return None

    if image_num < 0 or image_num >= len(game_db["games"][app_id_str][type_dict[image_type]]):
        logger.log(f"get_cached_file(): Invalid index {image_num}")
        return None

    image_url = game_db["games"][app_id_str][type_dict[image_type]][str(image_num)]["url"]
    logger.log(f"get_cached_file(): Image URL is {image_url}")

    ftype = "png"
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


def fetch_image_urls(headers, image_type, query_param, sgdb_id, url_list):
    page = 0
    while True:
        query_param["page"] = page
        query_string = "&".join(f"{k}={v}" for k, v in query_param.items())
        url = f"https://www.steamgriddb.com/api/v2/{type_dict[image_type]}/game/{sgdb_id}?{query_string}"
        response = requests.get(url, headers=headers)

        if response.status_code == 200:
            data = response.json()
            if data["success"] and len(data["data"]) > 0:
                for item in data["data"]:
                    url_list.append(item["url"])
                if len(data["data"]) < 50:
                    break
                page += 1
            else:
                logger.log(f"get_cached_file(): Unsuccessful - 'success' is false or no data for url {response.url}")
                break
        else:
            logger.log(f"get_cached_file(): Unsuccessful - HTTP {response.status_code} for url {response.url}")
            break


##############
# INTERFACES #
##############

class Backend:
    @staticmethod
    def get_image(app_name, app_id, image_type, image_num, set_current, is_replace_collection = False):
        logger.log(f"get_image() called for app {app_name} with ID {app_id} and type {image_type} and index {image_num}")
        curr_image = get_current_image_num(app_id, image_type)
        cached_file = get_cached_file(app_name, app_id, image_type, image_num, set_current)

        if is_replace_collection:
            if (not get_config()["replace_custom_images"] and curr_image != -1) or app_id in get_config()["appids_excluded_from_replacement"]:
                cached_file = get_cached_file(app_name, app_id, image_type, curr_image, set_current)
            elif get_config()["prioritize_animated"]:
                images = game_db["games"][str(app_id)][type_dict[image_type]]
                for i, image in images.items():
                    if image["type"] == "animated":
                        cached_file = get_cached_file(app_name, app_id, image_type, int(i), set_current)
                        break

        if cached_file is not None:
            logger.log("get_image() -> Image exists, returning encoded data")
            return cached_file
        else:
            logger.log("get_image() -> Image not found")
            return ""

    @staticmethod
    def get_current_index(app_id, image_type):
        logger.log(f"get_current_index() called for app {app_id} and type {image_type}")
        current_num = get_current_image_num(app_id, image_type)
        logger.log(f"get_current_index() -> {current_num}")
        return current_num

    @staticmethod
    def get_max_index(app_id, image_type):
        logger.log(f"get_max_index() called for app {app_id} and type {image_type}")
        max_num = get_max_image_num(app_id, image_type)
        logger.log(f"get_max_index() -> {max_num}")
        return max_num

    @staticmethod
    def purge_cache(app_id):
        logger.log(f"purge_cache() called for app {app_id}")
        delete_app_from_db(app_id)
        for f in glob.glob(os.path.join(get_cache_dir(), f"{app_id}_*")):
            os.remove(f)
        return True

    @staticmethod
    def get_steamgriddb_id(app_id: int) -> int:
        try:
            app_id_str = str(app_id)
            if app_id_str in game_db["overrides"]:
                return game_db["overrides"][app_id_str]
            return None
        except:
            return None

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
