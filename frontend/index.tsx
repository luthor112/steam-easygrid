import { callable, findModule, sleep, Millennium, Menu, MenuItem, showContextMenu, DialogButton, showModal, SidebarNavigation, IconsModule, definePlugin, Field, TextField, Toggle } from "@steambrew/client";
import { createRoot } from "react-dom/client";
import React, { useState, useEffect } from "react";

declare global {
    var MainWindowBrowserManager: any;
    var appStore: any;
    var collectionStore: any;
    var uiStore: any;
}

// Backend functions
const call_api_backend = callable<[{ a_bearer: string, b_endpoint: string }], string>('call_api_backend');
const download_image = callable<[{ a_img_url: string }], number>('download_image');
const get_image_chunk = callable<[{ a_img_url: string, b_chunk_index: number }], string>('get_image_chunk');
const cleanup_image = callable<[{ a_img_url: string }], void>('cleanup_image');
const log_frontend = callable<[{ msg: string }], void>('log_frontend');

const CHUNK_SIZE_BYTES = 6 * 1024 * 1024;

async function fetchEncodedImage(imgURL: string): Promise<string | undefined> {
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

const WaitForElement = async (sel: string, parent = document) =>
	[...(await Millennium.findElement(parent, sel))][0];

/*const WaitForElementTimeout = async (sel: string, parent = document, timeOut = 1000) =>
	[...(await Millennium.findElement(parent, sel, timeOut))][0];*/

/*const WaitForElementList = async (sel: string, parent = document) =>
	[...(await Millennium.findElement(parent, sel))];*/

const imgTypeDict = ["grids", "heroes", "logos", "wide_grids", "icons"];

type ImageTypeSubConfig = {
    nsfw: string,
    humor: string,
    epilepsy: string,
    types: string,
    mimes: string,
    styles: string,
    dimensions?: string
};

type PluginConfig = {
    api_key: string,
    display_name_fallback: boolean,
    replace_custom_images: boolean,
    appids_excluded_from_replacement: string,
    prioritize_animated: boolean,
    prioritize_authors: string[],
    expand_headers: string,
    app_page_button: boolean,
    collection_button: boolean,
    disable_webp: boolean,
    reapply_app_page: boolean,
    grids_config: ImageTypeSubConfig,
    wide_grids_config: ImageTypeSubConfig,
    heroes_config: ImageTypeSubConfig,
    logos_config: ImageTypeSubConfig,
    icons_config: ImageTypeSubConfig,
    icons_enabled: boolean,
    grids_width_mult: number,
    heroes_width_mult: number,
    logos_width_mult: number,
    icons_width_mult: number
};

var pluginConfig: PluginConfig = {
    api_key: "",
    display_name_fallback: true,
    replace_custom_images: true,
    appids_excluded_from_replacement: "",
    prioritize_animated: false,
    prioritize_authors: [],
    expand_headers: "",
    app_page_button: true,
    collection_button: true,
    disable_webp: true,
    reapply_app_page: true,
    grids_config: {
        nsfw: "false",
        humor: "any",
        epilepsy: "any",
        types: "static,animated",
        mimes: "image/webp,image/png,image/jpeg",
        styles: "alternate,blurred,white_logo,material,no_logo",
        dimensions: "600x900,342x482,660x930,512x512,1024x1024"
    },
    wide_grids_config: {
        nsfw: "false",
        humor: "any",
        epilepsy: "any",
        types: "static,animated",
        mimes: "image/webp,image/png,image/jpeg",
        styles: "alternate,blurred,white_logo,material,no_logo",
        dimensions: "460x215,920x430,512x512,1024x1024"
    },
    heroes_config: {
        nsfw: "false",
        humor: "any",
        epilepsy: "any",
        types: "static,animated",
        mimes: "image/webp,image/png,image/jpeg",
        styles: "alternate,blurred,material",
        dimensions: ""
    },
    logos_config: {
        nsfw: "false",
        humor: "any",
        epilepsy: "any",
        types: "static,animated",
        mimes: "image/webp,image/png",
        styles: "official,white,black,custom",
        dimensions: ""
    },
    icons_config: {
        nsfw: "false",
        humor: "any",
        epilepsy: "any",
        types: "static,animated",
        mimes: "image/png,image/vnd.microsoft.icon",
        styles: "official,custom",
        dimensions: ""
    },
    icons_enabled: false,
    grids_width_mult: 5,
    heroes_width_mult: 10,
    logos_width_mult: 7,
    icons_width_mult: 7
};

type GameIDOverrides = Record<string, number>;

var gameIDOverrides: GameIDOverrides = {};

type SearchCache = Record<string, Record<string, any>>;

var searchCache: SearchCache = {};

type AppCustomizationState = {
    grids: boolean;
    heroes: boolean;
    logos: boolean;
    wide_grids: boolean;
    icons: boolean;
};

type CustomizationStates = Record<string, AppCustomizationState>;

var customizationStates: CustomizationStates = {};

function SetCustomizationState(appID: number, imgType: number, newState: boolean) {
    if (!(appID.toString() in customizationStates)) {
        customizationStates[appID.toString()] = {
            grids: false,
            heroes: false,
            logos: false,
            wide_grids: false,
            icons: false
        };
    }

    customizationStates[appID.toString()][imgTypeDict[imgType] as keyof AppCustomizationState] = newState;
    localStorage.setItem("luthor112.steam-easygrid.customization", JSON.stringify(customizationStates));
}

function GetCustomizationState(appID: number, imgType: number) {
    if (appID.toString() in customizationStates) {
        return customizationStates[appID.toString()][imgTypeDict[imgType] as keyof AppCustomizationState];
    } else {
        return false;
    }
}

function getExcludedAppIDs() {
    let excludeAppsList = [];
    if (pluginConfig.appids_excluded_from_replacement !== "") {
        const strParts = pluginConfig.appids_excluded_from_replacement.split(";");
        for (let i = 0; i < strParts.length; i = i + 2) {
            excludeAppsList.push(Number(strParts[i]));
        }
    }
    return excludeAppsList;
}

async function callAPI(endpoint: string) {
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

async function getSteamGridDBId(appId: number): Promise<number | undefined> {
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

async function searchAllPages(appId: number, imgType: number, typesOverride: string | undefined) {
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

async function getSearchData(appId: number, imgType: number) {
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

function getImageExtFromUrl(imgURL: string): 'jpg' | 'png' {
    return imgURL.endsWith(".jpg") || imgURL.endsWith(".jpeg") || imgURL.endsWith(".jfif") ? 'jpg' : 'png';
}

async function applyFirstWorkingImage(appId: number, imgType: number): Promise<boolean> {
    const gameId = await getSteamGridDBId(appId);
    if (!gameId) return false;

    const imgTypeName = imgTypeDict[imgType];
    const imgSearchTypeName = imgType === 3 ? "grids" : imgTypeName;
    const usedConfig = pluginConfig[`${imgTypeName}_config` as keyof PluginConfig] as ImageTypeSubConfig;

    let mimeList = usedConfig.mimes;
    if (pluginConfig.disable_webp) {
        mimeList = mimeList.replace("image/webp,", "").replace(",image/webp", "");
    }
    const dimStr = ("dimensions" in usedConfig && usedConfig["dimensions"]) ? `&dimensions=${usedConfig.dimensions}` : "";
    const baseQ = `nsfw=${usedConfig.nsfw}&humor=${usedConfig.humor}&epilepsy=${usedConfig.epilepsy}&mimes=${mimeList}&styles=${usedConfig.styles}${dimStr}`;

    const tryTypes = async (types: string): Promise<boolean> => {
        for (let page = 0; ; page++) {
            const result = await callAPI(`${imgSearchTypeName}/game/${gameId}?${baseQ}&types=${types}&page=${page}`);
            if (!result?.data?.length) return false;
            for (const item of result.data) {
                const imageData = await fetchEncodedImage(item.url);
                if (imageData) {
                    SteamClient.Apps.SetCustomArtworkForApp(appId, imageData, getImageExtFromUrl(item.url), imgType);
                    SetCustomizationState(appId, imgType, true);
                    return true;
                }
            }
            if (result.data.length < 50) return false;
        }
    };

    if (pluginConfig.prioritize_animated) {
        return await tryTypes("animated") || await tryTypes("static");
    }
    return await tryTypes(usedConfig.types);
}

async function getImageData(appId: number, imgType: number, imgNum: number) {
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

async function getImageExt(appId: number, imgType: number, imgNum: number) {
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

async function renderHome(popup: any) {
    const headerDiv = await WaitForElement(`div.${findModule(e => e.ShowcaseHeader).ShowcaseHeader}`, popup.m_popup.document);
    const oldGridButton = headerDiv.querySelector('button.easygrid-button');
    if (!oldGridButton && pluginConfig.collection_button) {
        const gridButton = popup.m_popup.document.createElement("div");
        const gridButtonRoot = createRoot(gridButton);
        gridButtonRoot.render(<DialogButton className="easygrid-button" style={{width: "50px"}}>SGDB</DialogButton>);
        headerDiv.insertBefore(gridButton, headerDiv.firstChild!.nextSibling!.nextSibling);

        gridButton.addEventListener("click", async () => {
            const extraMenuItems = [];
            for (let i = 0; i < collectionStore.userCollections.length; i++) {
                const collId = collectionStore.userCollections[i].m_strId;
                const collName = collectionStore.userCollections[i].m_strName;
                extraMenuItems.push(<MenuItem onClick={async () => {
                    const currentColl = collectionStore.GetCollection(collId);
                    const excludedAppIDs = getExcludedAppIDs();
                    for (let j = 0; j < currentColl.allApps.length; j++) {
                        gridButton.firstChild.innerHTML = `Working... (${j}/${currentColl.allApps.length})`;
                        const appid = currentColl.allApps[j].appid;
                        if (appid in excludedAppIDs) continue;
                        if (!pluginConfig.replace_custom_images && GetCustomizationState(appid, 0)) continue;
                        await applyFirstWorkingImage(appid, 0);
                        delete searchCache[appid.toString()];
                    }
                    gridButton.firstChild.innerHTML = "Done!";
                    console.log("[steam-easygrid 4] Grids replaced for", collId);
                }}> Replace grids of {collName} </MenuItem>);
                extraMenuItems.push(<MenuItem onClick={async () => {
                    const currentColl = collectionStore.GetCollection(collId);
                    for (let j = 0; j < currentColl.allApps.length; j++) {
                        gridButton.firstChild.innerHTML = `Working... (${j}/${currentColl.allApps.length})`;
                        SteamClient.Apps.ClearCustomArtworkForApp(currentColl.allApps[j].appid, 0);
                        SetCustomizationState(currentColl.allApps[j].appid, 0, false);
                    }
                    gridButton.firstChild.innerHTML = "Done!";
                    console.log("[steam-easygrid 4] Grids cleared for", collId);
                }}> Reset grids of {collName} </MenuItem>);
            }

            showContextMenu(
                <Menu label="EasyGrid Options">
                    {extraMenuItems}
                </Menu>,
                gridButton,
                {bForcePopup: true}
            );
        });
    }
}

async function renderCollection(popup: any) {
    const collOptionsDiv = await WaitForElement(`div.${findModule(e => e.CollectionOptions).CollectionOptions}`, popup.m_popup.document);
    const oldGridButton = collOptionsDiv.querySelector('button.easygrid-button');
    if (!oldGridButton && pluginConfig.collection_button) {
        const gridButton = popup.m_popup.document.createElement("div");
        const gridButtonRoot = createRoot(gridButton);
        gridButtonRoot.render(<DialogButton className="easygrid-button" style={{width: "50px"}}>SGDB</DialogButton>);
        collOptionsDiv.insertBefore(gridButton, collOptionsDiv.firstChild!.nextSibling);

        gridButton.addEventListener("click", async () => {
            showContextMenu(
                <Menu label="EasyGrid Options">
                    <MenuItem onClick={async () => {
                        const currentColl = collectionStore.GetCollection(uiStore.currentGameListSelection.strCollectionId);
                        const excludedAppIDs = getExcludedAppIDs();
                        for (let j = 0; j < currentColl.allApps.length; j++) {
                            gridButton.firstChild.innerHTML = `Working... (${j}/${currentColl.allApps.length})`;
                            const appid = currentColl.allApps[j].appid;
                            if (appid in excludedAppIDs) continue;
                            if (!pluginConfig.replace_custom_images && GetCustomizationState(appid, 0)) continue;
                            await applyFirstWorkingImage(appid, 0);
                            delete searchCache[appid.toString()];
                        }
                        gridButton.firstChild.innerHTML = "Done!";
                        console.log("[steam-easygrid 4] Grids replaced for", uiStore.currentGameListSelection.strCollectionId);
                    }}> Replace grids </MenuItem>
                    <MenuItem onClick={async () => {
                        const currentColl = collectionStore.GetCollection(uiStore.currentGameListSelection.strCollectionId);
                        for (let j = 0; j < currentColl.allApps.length; j++) {
                            gridButton.firstChild.innerHTML = `Working... (${j}/${currentColl.allApps.length})`;
                            SteamClient.Apps.ClearCustomArtworkForApp(currentColl.allApps[j].appid, 0);
                            SetCustomizationState(currentColl.allApps[j].appid, 0, false);
                        }
                        gridButton.firstChild.innerHTML = "Done!";
                        console.log("[steam-easygrid 4] Grids cleared for", uiStore.currentGameListSelection.strCollectionId);
                    }}> Reset grids </MenuItem>
                </Menu>,
                gridButton,
                {bForcePopup: true}
            );
        });
    }
}

type GetEasyGridComponentProps = {
    appid: number;
    appname: string;
    imagetype: number;
    imageWidthMult: number;
};

function getEasyGridComponent(popup: any) {
    return (props: GetEasyGridComponentProps) => {
        const containerStyle: React.CSSProperties = {
            display: 'flex',
            flexWrap: 'wrap',
            overflowX: 'hidden',
            overflowY: 'auto',
            padding: '10px',
            gap: '10px',
            width: '100%'
        };

        const imageWrapperStyle: React.CSSProperties = {
            width: (popup.m_popup.window.screen.width * props.imageWidthMult) + 'px',
            minWidth: "150px",
            height: "auto",
            position: 'relative',
            display: 'inline-block'
        };

        const imageStyle: React.CSSProperties = {
            width: '100%', // adjust as needed
            height: 'auto',
            objectFit: 'cover',
            borderRadius: '8px',
            display: 'block'
        };

        const statusStyle: React.CSSProperties = {
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: 'darkgray',
            fontSize: '24px',
            fontWeight: 'bold'
        };

        const [steamGridDBId, setSteamGridDBId] = useState<number>(-1);
        const [thumbnailList, setThumbnailList] = useState([]);
        const [sgdbIdInput, setSteamGridDBIdInput] = useState<string>("");

        const GetCurrentSettings = async () => {
            const id = await getSteamGridDBId(props.appid);
            setSteamGridDBId(id !== undefined ? id : -1);
            setSteamGridDBIdInput(id !== undefined ? id.toString() : "");
            setThumbnailList(await getSearchData(props.appid, props.imagetype));
        };

        const PurgeImageCache = async () => {
            console.log("[steam-easygrid 4] Purging cache and reloading...");
            searchCache[props.appid.toString()] = {};
            GetCurrentSettings();
        };

        const SetSteamGridDBIdOverride = async () => {
            const newId = Number(sgdbIdInput);
            if (!isNaN(newId) && newId > 0) {
                gameIDOverrides[props.appid.toString()] = newId;
                localStorage.setItem("luthor112.steam-easygrid.overrides", JSON.stringify(gameIDOverrides));
                searchCache[props.appid.toString()] = {};
                GetCurrentSettings();
            }
        };

        const ClearSteamGridDBIdOverride = async () => {
            delete gameIDOverrides[props.appid.toString()];
            localStorage.setItem("luthor112.steam-easygrid.overrides", JSON.stringify(gameIDOverrides));
            searchCache[props.appid.toString()] = {};
            GetCurrentSettings();
        };

        const SetNewImage = async (e: React.MouseEvent<HTMLElement>) => {
            const targetNum = Number((e.target as HTMLElement).dataset.imageindex);
            console.log("[steam-easygrid 4] Setting image to:", targetNum);
            ((e.target as HTMLElement).nextElementSibling as HTMLElement)!.innerText = "DOWNLOADING";
            ((e.target as HTMLElement).nextElementSibling as HTMLElement)!.style.color = 'darkgray';
            
            const newImage = await getImageData(props.appid, props.imagetype, targetNum);
            if (newImage) {
                const imageExt = await getImageExt(props.appid, props.imagetype, targetNum);
                SteamClient.Apps.SetCustomArtworkForApp(props.appid, newImage, imageExt!, props.imagetype);
                SetCustomizationState(props.appid, props.imagetype, true);

                ((e.target as HTMLElement).nextElementSibling as HTMLElement)!.innerText = "DONE";
                ((e.target as HTMLElement).nextElementSibling as HTMLElement)!.style.color = 'darkgreen';
            } else {
                ((e.target as HTMLElement).nextElementSibling as HTMLElement)!.innerText = "FAILED";
                ((e.target as HTMLElement).nextElementSibling as HTMLElement)!.style.color = 'darkred';
            }
        };

        const SetOriginalImage = async () => {
            console.log("[steam-easygrid 4] Resetting image...");
            SteamClient.Apps.ClearCustomArtworkForApp(props.appid, props.imagetype);
            SetCustomizationState(props.appid, props.imagetype, false);
        };

        const OpenWebpage = async () => {
            console.log("[steam-easygrid 4] Opening SGDB Webpage...");
            window.open(`https://www.steamgriddb.com/game/${steamGridDBId}`, "_blank");
        };

        useEffect(() => {
            GetCurrentSettings();
        }, []);

        return (
            <div>
                App ID: {props.appid} / SGDB ID: {steamGridDBId} / Image Type: {props.imagetype} (found {thumbnailList.length}) <br/>
                <DialogButton style={{width: "120px", display: "inline-block"}} onClick={SetOriginalImage}>Reset</DialogButton> &nbsp;
                <DialogButton style={{width: "120px", display: "inline-block"}} onClick={PurgeImageCache}>Purge Cache</DialogButton> &nbsp;
                <DialogButton style={{width: "120px", display: "inline-block"}} onClick={OpenWebpage}>Open Webpage</DialogButton>
                <div style={{maxWidth: "150px", display: "inline-block", marginRight: "35px", marginLeft: "10px"}}><TextField value={sgdbIdInput} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSteamGridDBIdInput(e.currentTarget.value)} mustBeNumeric={true} /></div>
                <DialogButton style={{width: "120px", display: "inline-block"}} onClick={SetSteamGridDBIdOverride}>Set SGDB ID</DialogButton> &nbsp;
                <DialogButton style={{width: "120px", display: "inline-block"}} onClick={ClearSteamGridDBIdOverride}>Clear SGDB ID</DialogButton><br/>
                <div style={containerStyle}>
                    {thumbnailList.map((thumbData, index) => {
                        if (thumbData["type"] === "static")
                            return (
                                <div style={imageWrapperStyle}>
                                    <img key={index} data-imageindex={index} src={thumbData["thumb"]} alt={thumbData["type"]} style={imageStyle} onClick={SetNewImage}/>
                                    <div key={`${index}-status`} style={statusStyle}></div>
                                </div>
                            );

                        return (
                            <div style={imageWrapperStyle}>
                                <video key={index} data-imageindex={index} autoPlay loop muted playsInline src={thumbData["thumb"]} title={thumbData["type"]} style={imageStyle} onClick={SetNewImage}/>
                                <div key={`${index}-status`} style={statusStyle}></div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };
}

async function openSGDBWindow(popup: any) {
    const EasyGridComponent = getEasyGridComponent(popup);

    const currentColl = collectionStore.GetCollection(uiStore.currentGameListSelection.strCollectionId);
    const currentApp = currentColl.allApps.find((x: any) => x.appid === uiStore.currentGameListSelection.nAppId);
    const heroWidthMult = pluginConfig.heroes_width_mult / 100;
    const logoWidthMult = pluginConfig.logos_width_mult / 100;
    const gridWidthMult = pluginConfig.grids_width_mult / 100;
    const iconWidthMult = pluginConfig.icons_width_mult / 100;

    let modalPages = [
        {title: <div>Hero</div>, content: <EasyGridComponent key="hero_page" appid={uiStore.currentGameListSelection.nAppId} appname={currentApp.display_name} imagetype={1} imageWidthMult={heroWidthMult}/>},
        {title: <div>Logo</div>, content: <EasyGridComponent key="logo_page" appid={uiStore.currentGameListSelection.nAppId} appname={currentApp.display_name} imagetype={2} imageWidthMult={logoWidthMult}/>},
        {title: <div>Grid</div>, content: <EasyGridComponent key="grid_page" appid={uiStore.currentGameListSelection.nAppId} appname={currentApp.display_name} imagetype={0} imageWidthMult={gridWidthMult}/>},
        {title: <div>Wide Grid</div>, content: <EasyGridComponent key="widegrid_page" appid={uiStore.currentGameListSelection.nAppId} appname={currentApp.display_name} imagetype={3} imageWidthMult={gridWidthMult}/>}
    ];
    if (pluginConfig.icons_enabled) {
        modalPages.push({title: <div>Icon</div>, content: <EasyGridComponent key="icon_page" appid={uiStore.currentGameListSelection.nAppId} appname={currentApp.display_name} imagetype={4} imageWidthMult={iconWidthMult}/>});
    }

    showModal(
        <SidebarNavigation pages={modalPages} showTitle={true} title={currentApp.display_name}/>,
        popup.m_popup.window, {strTitle: "EasyGrid", bHideMainWindowForPopouts: false, bForcePopOut: true, popupHeight: 700, popupWidth: 1500}
    );
}

async function renderApp(popup: any) {
    const topCapsuleDiv = await WaitForElement(`div.${findModule(e => e.TopCapsule).TopCapsule}`, popup.m_popup.document);
    if (!topCapsuleDiv.classList.contains("easygrid-header")) {
        topCapsuleDiv.addEventListener("dblclick", async() => {
            openSGDBWindow(popup);
        });
        topCapsuleDiv.classList.add("easygrid-header");
    }

    const appPageButtonEnabled = pluginConfig.app_page_button;
    if (appPageButtonEnabled) {
        const gameSettingsButton = await WaitForElement(`div.${findModule(e => e.InPage).InPage} div.${findModule(e => e.AppButtonsContainer).AppButtonsContainer} > div.${findModule(e => e.MenuButtonContainer).MenuButtonContainer}:not([role="button"])`, popup.m_popup.document);
        const oldGridButton = gameSettingsButton.parentNode!.querySelector('div.easygrid-button');
        if (!oldGridButton) {
            const gridButton = gameSettingsButton.cloneNode(true) as HTMLElement;
            gridButton.classList.add("easygrid-button");
            (gridButton.firstChild as HTMLElement)!.innerHTML = "SG";
            gameSettingsButton.parentNode!.insertBefore(gridButton, gameSettingsButton.nextSibling);

            gridButton.addEventListener("click", async () => {
                showContextMenu(
                    <Menu label="SGDB Options">
                        <MenuItem onClick={async () => {
                            const allImageTypes = pluginConfig.icons_enabled ? 5 : 4;
                            const appId = uiStore.currentGameListSelection.nAppId;
                            for (let j = 0; j < allImageTypes; j++) {
                                (gridButton.firstChild as HTMLElement)!.innerHTML = `${j}/${allImageTypes}`;
                                await applyFirstWorkingImage(appId, j);
                            }
                            (gridButton.firstChild as HTMLElement)!.innerHTML = "SG";
                            console.log("[steam-easygrid 4] Images replaced for", appId);
                        }}> Auto replace images </MenuItem>
                        <MenuItem onClick={async () => {
                            openSGDBWindow(popup);
                        }}> Open window </MenuItem>
                    </Menu>,
                    gridButton,
                    { bForcePopup: true }
                );
            });
        }
    }

    const expandHeadersValue = pluginConfig.expand_headers;
    if (expandHeadersValue !== "") {
        for (const el of popup.m_popup.document.querySelectorAll(`*:has(> .${findModule(e => e.ImgSrc).ImgSrc})`)) {
            el.style.setProperty("height", "auto", "important");
        }

        (topCapsuleDiv as HTMLElement).style.setProperty("max-height", expandHeadersValue, "important");

        for (const el of popup.m_popup.document.querySelectorAll(`.${findModule(e => e.BoxSizer).BoxSizer} img`)) {
            el.style.setProperty("width", "50%", "important");
            el.style.setProperty("height", "50%", "important");
            el.style.setProperty("margin-bottom", "100px", "important");
        }

        for (const el of popup.m_popup.document.querySelectorAll(`.${findModule(e => e.TitleSection).TitleSection}`)) {
            el.style.setProperty("bottom", "100px", "important");
        }
    }
}

async function renderAppAndObserve(popup: any) {
    await renderApp(popup);

    if (pluginConfig.reapply_app_page) {
        const topCapsuleDiv = await WaitForElement(`div.${findModule(e => e.TopCapsule).TopCapsule}`, popup.m_popup.document);
        const topCapsuleObserver = new MutationObserver(async (mutationList: any, observer: any) => {
            void mutationList;
            void observer;
            await renderApp(popup);
        });
        topCapsuleObserver.observe(topCapsuleDiv.parentNode!, { subtree: true, childList: true, attributes: true });
    }
}

async function OnPopupCreation(popup: any) {
    await sleep(10000);
    if (popup.m_strName === "SP Desktop_uid0") {
        var mwbm = undefined;
        while (!mwbm) {
            console.log("[steam-easygrid 4] Waiting for MainWindowBrowserManager");
            try {
                mwbm = MainWindowBrowserManager;
            } catch {
                await sleep(100);
            }
        }

        console.log("[steam-easygrid 4] Registering callback");
        MainWindowBrowserManager.m_browser.on("finished-request", async (currentURL: any, previousURL: any) => {
            void currentURL;
            void previousURL;

            if (MainWindowBrowserManager.m_lastLocation.pathname === "/library/home") {
                await renderHome(popup);
            } else if (MainWindowBrowserManager.m_lastLocation.pathname.startsWith("/library/collection/")) {
                await renderCollection(popup);
            } else if (MainWindowBrowserManager.m_lastLocation.pathname.startsWith("/library/app/")) {
                await renderAppAndObserve(popup);
            }
        });
    }
}

type BoolKeys = {
    [K in keyof PluginConfig]: PluginConfig[K] extends boolean ? K : never
  }[keyof PluginConfig];
  
type StringKeys = {
    [K in keyof PluginConfig]: PluginConfig[K] extends string ? K : never
}[keyof PluginConfig];

type NumKeys = {
    [K in keyof PluginConfig]: PluginConfig[K] extends number ? K : never
}[keyof PluginConfig];

type StringArrayKeys = {
    [K in keyof PluginConfig]: PluginConfig[K] extends string[] ? K : never
}[keyof PluginConfig];

type SingleSettingProps =
  | { type: "bool"; name: BoolKeys; label: string; description: string; readonly?: boolean }
  | { type: "text"; name: StringKeys; label: string; description: string; readonly?: boolean }
  | { type: "num"; name: NumKeys; label: string; description: string; readonly?: boolean }
  | { type: "textchild"; name: keyof ImageTypeSubConfig; parentname: keyof PluginConfig; label: string; description: string; readonly?: boolean }
  | { type: "array"; name: StringArrayKeys; label: string; description: string; readonly?: boolean };

const SingleSetting = (props: SingleSettingProps) => {
    const [boolValue, setBoolValue] = useState(false);
    const [isDisabled, setIsDisabled] = useState(false);

    const saveConfig = () => {
        localStorage.setItem("luthor112.steam-easygrid.config", JSON.stringify(pluginConfig));
        searchCache = {};
    };

    useEffect(() => {
        if (props.type === "bool") {
            setBoolValue(pluginConfig[props.name]);
        }

        if (props.readonly) {
            setIsDisabled(true);
        }
    }, []);

    if (props.type === "bool") {
        return (
            <Field label={props.label} description={props.description} bottomSeparator="standard" focusable>
                <Toggle disabled={isDisabled} value={boolValue} onChange={(value) => { setBoolValue(value); pluginConfig[props.name] = value; saveConfig(); }} />
            </Field>
        );
    } else if (props.type === "text") {
        return (
            <Field label={props.label} description={props.description} bottomSeparator="standard" focusable>
                <TextField disabled={isDisabled} defaultValue={pluginConfig[props.name]} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { pluginConfig[props.name] = e.currentTarget.value; saveConfig(); }} />
            </Field>
        );
    } else if (props.type === "num") {
        return (
            <Field label={props.label} description={props.description} bottomSeparator="standard" focusable>
                <TextField disabled={isDisabled} mustBeNumeric={true} defaultValue={pluginConfig[props.name].toString()} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { pluginConfig[props.name] = Number(e.currentTarget.value); saveConfig(); }} />
            </Field>
        );
    } else if (props.type === "textchild") {
        return (
            <Field label={props.label} description={props.description} bottomSeparator="standard" focusable>
                <TextField disabled={isDisabled} defaultValue={(pluginConfig[props.parentname] as ImageTypeSubConfig)[props.name]} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { (pluginConfig[props.parentname] as ImageTypeSubConfig)[props.name] = e.currentTarget.value; saveConfig(); }} />
            </Field>
        );
    } else if (props.type === "array") {
        return (
            <Field label={props.label} description={props.description} bottomSeparator="standard" focusable>
                <TextField disabled={isDisabled} defaultValue={pluginConfig[props.name].join(", ")} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { pluginConfig[props.name] = e.currentTarget.value.split(",").map(s => s.trim()).filter(s => s.length > 0); saveConfig(); }} />
            </Field>
        );
    } else {
        return (
            <div>This should not happen...</div>
        );
    }
}

type ImageSearchSettingProps = {
    name: keyof PluginConfig
    label: string;
};

const ImageSearchSetting = (props: ImageSearchSettingProps) => {
    return (
        <div>
            <SingleSetting name="nsfw" parentname={props.name} type="textchild" label={`${props.label} :: nsfw`} description="any | true | false" />
            <SingleSetting name="humor" parentname={props.name} type="textchild" label={`${props.label} :: humor`} description="any | true | false" />
            <SingleSetting name="epilepsy" parentname={props.name} type="textchild" label={`${props.label} :: epilepsy`} description="any | true | false" />
            <SingleSetting name="types" parentname={props.name} type="textchild" label={`${props.label} :: types`} description="Comma separated" />
            <SingleSetting name="mimes" parentname={props.name} type="textchild" label={`${props.label} :: mimes`} description="Comma separated" />
            <SingleSetting name="styles" parentname={props.name} type="textchild" label={`${props.label} :: styles`} description="Comma separated" />
            <SingleSetting name="dimensions" parentname={props.name} type="textchild" label={`${props.label} :: dimensions`} description="Comma separated" />
        </div>
    );
}

const SettingsContent = () => {
    return (
        <div>
            <SingleSetting name="api_key" type="text" label="API key" description="Your SteamGridDB API key" />
            <SingleSetting name="display_name_fallback" type="bool" label="Search by name fallback" description="Fallback to searching by name if needed" />
            <SingleSetting name="replace_custom_images" type="bool" label="Always replace cusmtom Images" description="When replacing all grid images, replace custom set ones as well" />
            <SingleSetting name="appids_excluded_from_replacement" type="text" label="Exclude APPIDs from replacement" description="When replacing all grid images, skip these apps (separate by semicolon)" />
            <SingleSetting name="prioritize_animated" type="bool" label="Prioritize animated images" description="Prioritize animated images" />
            <SingleSetting name="prioritize_authors" type="array" label="Prioritize Authors" description="Prioritize images by author (comma-separated, in order)" />
            <SingleSetting name="expand_headers" type="text" label="Expand app header size" description="Set custom header height" />
            <SingleSetting name="app_page_button" type="bool" label="Show SG button" description="Show SG button on application pages" />
            <SingleSetting name="collection_button" type="bool" label="Show SGDB button" description="Show SGDB button for Collections" />
            <SingleSetting name="disable_webp" type="bool" label="Disable WEBP support" description="Avoids crashes for some users" />
            <SingleSetting name="reapply_app_page" type="bool" label="Reapply on UI modification" description="Fixes header size problem, causes others" />
            <ImageSearchSetting name="grids_config" label="Grids" />
            <ImageSearchSetting name="wide_grids_config" label="Wide Grids" />
            <ImageSearchSetting name="heroes_config" label="Heroes" />
            <ImageSearchSetting name="logos_config" label="Logos" />
            <ImageSearchSetting name="icons_config" label="Icons" />
            <SingleSetting name="icons_enabled" type="bool" label="Enable Icons" description="Enable functionality for Icons" />
            <SingleSetting name="grids_width_mult" type="num" label="Grid width scale" description="Scale preview images on the GUI" />
            <SingleSetting name="heroes_width_mult" type="num" label="Hero width scale" description="Scale preview images on the GUI" />
            <SingleSetting name="logos_width_mult" type="num" label="Logo width scale" description="Scale preview images on the GUI" />
            <SingleSetting name="icons_width_mult" type="num" label="Icon width scale" description="Scale preview images on the GUI" />
        </div>
    );
};

export default definePlugin(async () => {
    console.log("[steam-easygrid 4] frontend startup");

    const rawValue = localStorage.getItem("luthor112.steam-easygrid.config");
    const storedConfig: Partial<PluginConfig> = rawValue ? JSON.parse(rawValue) : {};
    pluginConfig = { ...pluginConfig, ...storedConfig };
    console.log("[steam-easygrid 4] Merged config:", pluginConfig);

    const rawOverrideValue = localStorage.getItem("luthor112.steam-easygrid.overrides");
    const storedOverrides: GameIDOverrides = rawOverrideValue ? JSON.parse(rawOverrideValue) : {};
    gameIDOverrides = { ...gameIDOverrides, ...storedOverrides };
    console.log("[steam-easygrid 4] Overrides:", gameIDOverrides);

    const rawCustomizationValue = localStorage.getItem("luthor112.steam-easygrid.customization");
    const storedCustomizationStates: CustomizationStates = rawCustomizationValue ? JSON.parse(rawCustomizationValue) : {};
    customizationStates = { ...customizationStates, ...storedCustomizationStates };
    console.log("[steam-easygrid 4] Customization states:", customizationStates);

    Millennium.AddWindowCreateHook!(OnPopupCreation);

    return {
        title: "Easy SteamGrid",
        icon: <IconsModule.Settings />,
        content: <SettingsContent />,
    };
});
