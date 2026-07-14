import { call_api_backend, download_image, get_image_chunk, cleanup_image, log_frontend, set_icon_from_url } from "./backend";
import { pluginConfig, gameIDOverrides, searchCache, imgTypeDict, ICON_IMG_TYPE, SetCustomizationState, type ImageTypeSubConfig, type PluginConfig } from "./config";

const CHUNK_SIZE_BYTES = 6 * 1024 * 1024;

export async function fetchEncodedImage(imgURL: string): Promise<string | undefined> {
    const size = await download_image({ a_img_url: imgURL });
    if (!size) return undefined;

    const numChunks = Math.ceil(size / CHUNK_SIZE_BYTES);
    const parts: string[] = [];
    for (let i = 0; i < numChunks; i++) {
        const chunk = await get_image_chunk({ a_img_url: imgURL, b_chunk_index: i });
        if (!chunk) {
            await cleanup_image({ a_img_url: imgURL });
            return undefined;
        }
        parts.push(chunk);
    }
    await cleanup_image({ a_img_url: imgURL });
    return parts.join('') || undefined;
}

export async function callAPI(endpoint: string) {
    const apiAnswerStr = await call_api_backend({ a_bearer: pluginConfig.api_key, b_endpoint: endpoint });
    if (apiAnswerStr === "") {
        console.log("[steam-easygrid 4] Unsuccessful HTTP request");
        return undefined;
    }
    let apiAnswer;
    try {
        apiAnswer = JSON.parse(apiAnswerStr);
    } catch (e) {
        console.error("[steam-easygrid 4] Failed to parse API response:", e);
        return undefined;
    }
    if ("http_status" in apiAnswer) {
        console.log("[steam-easygrid 4] Unsuccessful API call - HTTP", apiAnswer["http_status"]);
        return undefined;
    } else if(!("success" in apiAnswer)) {
        console.log("[steam-easygrid 4] Unsuccessful API call - Malformed answer");
        return undefined;
    } else if(!apiAnswer["success"]) {
        console.log("[steam-easygrid 4] Unsuccessful API call - success is false");
        return undefined;
    } else {
        console.log("[steam-easygrid 4] Successful API call");
        return apiAnswer;
    }
}

export async function getSteamGridDBId(appId: number): Promise<number | undefined> {
    if (appId.toString() in gameIDOverrides) {
        return gameIDOverrides[appId.toString()];
    }

    try {
        const gamesResponse = await callAPI(`games/steam/${appId}`);
        if (gamesResponse) {
            gameIDOverrides[appId.toString()] = gamesResponse["data"]["id"];
            localStorage.setItem("luthor112.steam-easygrid.overrides", JSON.stringify(gameIDOverrides));
            return gamesResponse["data"]["id"];
        } else if (pluginConfig.display_name_fallback) {
            const currentApp = appStore.allApps.find((x: any) => x.appid === appId);
            if (!currentApp) return undefined;
            const searchResponse = await callAPI(`search/autocomplete/${encodeURIComponent(currentApp.display_name)}`);
            if (searchResponse) {
                if (searchResponse["data"].length > 0) {
                    gameIDOverrides[appId.toString()] = searchResponse["data"][0]["id"];
                    localStorage.setItem("luthor112.steam-easygrid.overrides", JSON.stringify(gameIDOverrides));
                    return searchResponse["data"][0]["id"];
                }
            }
        }
        return undefined;
    } catch (e) {
        console.error("[steam-easygrid 4] Failed to get SteamGridDB ID:", e);
        return undefined;
    }
}

export async function searchAllPages(appId: number, imgType: number, typesOverride: string | undefined) {
    const gameId = await getSteamGridDBId(appId);
    if (gameId) {
        const imgTypeName = imgTypeDict[imgType];
        const imgSearchTypeName = imgType === 3 ? "grids" : imgTypeName;
        const usedConfig = (pluginConfig[`${imgTypeName}_config` as keyof PluginConfig] as ImageTypeSubConfig);
        let fullResult: any[] = [];

        let mimeList = usedConfig.mimes;
        if (pluginConfig.disable_webp) {
            mimeList = mimeList.replace("image/webp,", "").replace(",image/webp", "");
        }
        let qString = `nsfw=${usedConfig.nsfw}&humor=${usedConfig.humor}&epilepsy=${usedConfig.epilepsy}&mimes=${mimeList}&styles=${usedConfig.styles}`;
        if (typesOverride) {
            qString += `&types=${typesOverride}`;
        } else {
            qString += `&types=${usedConfig.types}`;
        }
        if ("dimensions" in usedConfig && usedConfig["dimensions"]) {
            qString += `&dimensions=${usedConfig.dimensions}`;
        }

        let page = 0;
        while(true) {
            const searchResult = await callAPI(`${imgSearchTypeName}/game/${gameId}?${qString}&page=${page}`);
            if (searchResult && searchResult["data"].length > 0) {
                fullResult = fullResult.concat(searchResult["data"]);
                if (searchResult["data"].length < 50) {
                    break;
                }
                page++;
            } else {
                break;
            }
        }

        return fullResult;
    }
    return [];
}

function orderSearchDataByAuthors(searchData: any[]): any[] {
    const priorityAuthors: string[] = pluginConfig.prioritize_authors;
    if (priorityAuthors.length > 0) {
        searchData.sort((a, b) => {
            const aIdx = priorityAuthors.findIndex(author => a.author?.name?.toLowerCase() === author.toLowerCase());
            const bIdx = priorityAuthors.findIndex(author => b.author?.name?.toLowerCase() === author.toLowerCase());
            const aRank = aIdx === -1 ? priorityAuthors.length : aIdx;
            const bRank = bIdx === -1 ? priorityAuthors.length : bIdx;
            return aRank - bRank;
        });
    }

    return searchData;
}

export async function getSearchData(appId: number, imgType: number) {
    if (!(appId.toString() in searchCache)) {
        searchCache[appId.toString()] = {};
    }

    if (imgTypeDict[imgType] in searchCache[appId.toString()]) {
        return searchCache[appId.toString()][imgTypeDict[imgType]];
    }

    let searchData: any[] = [];
    if (pluginConfig.prioritize_animated) {
        let searchDataAnimated = await searchAllPages(appId, imgType, "animated");
        for (let i = 0; i < searchDataAnimated.length; i++) {
            searchDataAnimated[i]["type"] = "animated";
        }

        searchDataAnimated = orderSearchDataByAuthors(searchDataAnimated);

        let searchDataStatic = await searchAllPages(appId, imgType, "static");
        for (let i = 0; i < searchDataStatic.length; i++) {
            searchDataStatic[i]["type"] = "static";
        }

        searchDataStatic = orderSearchDataByAuthors(searchDataStatic);

        searchData = searchDataAnimated.concat(searchDataStatic);
    } else {
        searchData = await searchAllPages(appId, imgType, undefined);
        const searchDataAnimated = await searchAllPages(appId, imgType, "animated");
        for (let i = 0; i < searchData.length; i++) {
            if (searchDataAnimated.find(x => x.id === searchData[i].id)) {
                searchData[i]["type"] = "animated";
            } else {
                searchData[i]["type"] = "static";
            }
        }

        searchData = orderSearchDataByAuthors(searchData);
    }
    searchCache[appId.toString()][imgTypeDict[imgType]] = searchData;
    return searchData;
}

export function getImageExtFromUrl(imgURL: string): 'jpg' | 'png' {
    return imgURL.endsWith(".jpg") || imgURL.endsWith(".jpeg") || imgURL.endsWith(".jfif") ? 'jpg' : 'png';
}

function getIconExtFromUrl(imgURL: string): string {
    const match = imgURL.match(/\.([A-Za-z0-9]+)(?:\?[^/]*)?$/);
    return match ? match[1].toLowerCase() : 'png';
}

export async function applyIconFromUrl(appId: number, imgURL: string): Promise<boolean> {
    const size = await download_image({ a_img_url: imgURL });
    if (!size) return false;
    return await set_icon_from_url({ a_appid: appId, b_img_url: imgURL, c_extension: getIconExtFromUrl(imgURL) });
}

export async function applyFirstWorkingImage(appId: number, imgType: number): Promise<boolean> {
    const gameId = await getSteamGridDBId(appId);
    if (!gameId) return false;

    const searchResults = await getSearchData(appId, imgType);
    if (!searchResults?.length) return false;

    for (const item of searchResults) {
        if (imgType === ICON_IMG_TYPE) {
            if (await applyIconFromUrl(appId, item.url)) {
                SetCustomizationState(appId, imgType, true);
                return true;
            }
            continue;
        }
        const imageData = await fetchEncodedImage(item.url);
        if (imageData) {
            await SteamClient.Apps.ClearCustomArtworkForApp(appId, imgType);
            SteamClient.Apps.SetCustomArtworkForApp(appId, imageData, getImageExtFromUrl(item.url), imgType);
            SetCustomizationState(appId, imgType, true);
            return true;
        }
    }
    return false;
}

export async function getImageData(appId: number, imgType: number, imgNum: number) {
    await log_frontend({ msg: `getImageData appid=${appId} type=${imgType} index=${imgNum}` });
    const searchResults = await getSearchData(appId, imgType);
    await log_frontend({ msg: `image list length=${searchResults ? searchResults.length : null}` });
    if (searchResults && searchResults.length > imgNum) {
        const imgURL = searchResults[imgNum].url;
        await log_frontend({ msg: `requesting via backend url=${imgURL}` });
        const b64 = await fetchEncodedImage(imgURL);
        await log_frontend({ msg: `base64 length=${b64 ? b64.length : 'null'}` });
        return b64;
    }
    return undefined;
}

export async function getImageExt(appId: number, imgType: number, imgNum: number) {
    const searchResults = await getSearchData(appId, imgType);
    if (searchResults && searchResults.length > imgNum) {
        const imgURL = searchResults[imgNum].url;
        if(imgURL.endsWith(".jpg") || imgURL.endsWith(".jpeg") || imgURL.endsWith(".jfif")) {
            return 'jpg';
        } else {
            return 'png';
        }
    }
    return undefined;
}

export async function autoReplaceForApp(appid: number) {
    for (let j = 0; j < 5; j++) {
        await applyFirstWorkingImage(appid, j);
    }
    console.log("[steam-easygrid 4] Images replaced for", appid);
}
