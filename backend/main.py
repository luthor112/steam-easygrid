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

def get_config():
    with open(os.path.join(PLUGIN_BASE_DIR, "config.json"), "rt") as fp:
        return json.load(fp)

def get_cache_dir():
    return os.path.join(PLUGIN_BASE_DIR, "artcache")

def get_cached_filename(app_id, image_type):
    return os.path.join(get_cache_dir(), f"{app_id}_{image_type}.{get_config()['filetype']}")

def cache_image(app_id, image_type):
    if os.path.exists(get_cached_filename(app_id, image_type)):
        return

    logger.log(f"Searching for type {image_type} for app {app_id}")

    headers = {"Authorization": f"Bearer {get_config()['api_key']}"}
    query_param = {"limit": "1", "mimes": f"image/{get_config()['filetype']}"}
    query_param.update(get_config()["extra_config"])
    response = requests.get(f"https://www.steamgriddb.com/api/v2/{type_dict[image_type]}/steam/{app_id}", params=query_param, headers=headers)

    if response.status_code == 200 or response.status_code == 207:
        data = response.json()
        if data["success"] and len(data["data"]) > 0:
            image_url = data["data"][0]["url"]
            with requests.get(image_url, stream=True) as r:
                with open(get_cached_filename(app_id, image_type), "wb") as f:
                    shutil.copyfileobj(r.raw, f)

def get_encoded_image(app_id, image_type):
    with open(get_cached_filename(app_id, image_type), "rb") as fp:
        return base64.standard_b64encode(fp.read()).decode()

class Backend:
    @staticmethod
    def get_filetype():
        filetype = get_config()["filetype"]
        logger.log(f"get_filetype() -> {filetype}")
        return filetype

    @staticmethod
    def get_image(app_id, image_type):
        logger.log(f"get_image() called for app {app_id} and type {image_type}")

        cache_image(app_id, image_type)
        if os.path.exists(get_cached_filename(app_id, image_type)):
            return get_encoded_image(app_id, image_type)
        else:
            return ""

class Plugin:
    def _front_end_loaded(self):
        logger.log("Frontend loaded")

    def _load(self):
        logger.log(f"Plugin base dir: {PLUGIN_BASE_DIR}")

        cache_dir = get_cache_dir()
        if not os.path.exists(cache_dir):
            os.mkdir(cache_dir)
        logger.log(f"Cache dir: {cache_dir}")

        logger.log("Backend loaded")
        Millennium.ready()

    def _unload(self):
        logger.log("Unloading")
