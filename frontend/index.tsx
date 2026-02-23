import { callable, findModule, sleep, Millennium, Menu, MenuItem, showContextMenu, DialogButton, showModal, SidebarNavigation, IconsModule, definePlugin, Field, TextField, Toggle } from "@steambrew/client";
import { createRoot } from "react-dom/client";
import React, { useState, useEffect } from "react";

// Backend functions
const call_api_backend = callable<[{ a_bearer: string, b_endpoint: string }], string>('call_api_backend');
const get_encoded_image = callable<[{ img_url: string }], string>('get_encoded_image');

const WaitForElement = async (sel: string, parent = document) =>
	[...(await Millennium.findElement(parent, sel))][0];

const WaitForElementTimeout = async (sel: string, parent = document, timeOut = 1000) =>
	[...(await Millennium.findElement(parent, sel, timeOut))][0];

const WaitForElementList = async (sel: string, parent = document) =>
	[...(await Millennium.findElement(parent, sel))];

const imgTypeDict = ["grids", "heroes", "logos", "wide_grids", "icons"];

var pluginConfig = {
    api_key: "",
    display_name_fallback: true,
    replace_custom_images: true,
    appids_excluded_from_replacement: "",
    prioritize_animated: false,
    prioritize_authors: [],
    expand_headers: "",
    app_page_button: true,
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
        styles: "alternate,blurred,material"
    },
    logos_config: {
        nsfw: "false",
        humor: "any",
        epilepsy: "any",
        types: "static,animated",
        mimes: "image/webp,image/png",
        styles: "official,white,black,custom"
    },
    icons_config: {
        nsfw: "false",
        humor: "any",
        epilepsy: "any",
        types: "static,animated",
        mimes: "image/png,image/vnd.microsoft.icon",
        styles: "official,custom"
    },
    icons_enabled: false,
    grids_width_mult: 5,
    heroes_width_mult: 10,
    logos_width_mult: 7,
    icons_width_mult: 7
};

var gameIDOverrides = {};

var searchCache = {};

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

async function callAPI(endpoint) {
    const apiAnswerStr = await call_api_backend({ a_bearer: pluginConfig.api_key, b_endpoint: endpoint });
    if (apiAnswerStr === "") {
        console.log("[steam-easygrid 4] Unsuccessful HTTP request");
        return undefined;
    }
    const apiAnswer = JSON.parse(apiAnswerStr);
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
            const currentApp = appStore.allApps.find((x) => x.appid === appId);
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

async function searchAllPages(appId, imgType, typesOverride) {
    const gameId = await getSteamGridDBId(appId);
    if (gameId) {
        const imgTypeName = imgTypeDict[imgType];
        const imgSearchTypeName = imgType === 3 ? "grids" : imgTypeName;
        const usedConfig = pluginConfig[`${imgTypeName}_config`];
        let fullResult = [];

        let qString = `nsfw=${usedConfig.nsfw}&humor=${usedConfig.humor}&epilepsy=${usedConfig.epilepsy}&mimes=${usedConfig.mimes}&styles=${usedConfig.styles}`;
        if (typesOverride) {
            qString += `&types=${typesOverride}`;
        } else {
            qString += `&types=${usedConfig.types}`;
        }
        if ("dimensions" in usedConfig) {
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

async function getSearchData(appId, imgType) {
    if (!(appId.toString() in searchCache)) {
        searchCache[appId.toString()] = {};
    }

    if (imgTypeDict[imgType] in searchCache[appId.toString()]) {
        return searchCache[appId.toString()][imgTypeDict[imgType]];
    }

    let searchData = [];
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

async function getImageData(appId, imgType, imgNum) {
    const searchResults = await getSearchData(appId, imgType);
    if (searchResults && searchResults.length > imgNum) {
        const imgURL = searchResults[imgNum].url;
        return await get_encoded_image({ img_url: imgURL });
    }
    return undefined;
}

async function renderHome(popup: any) {
    const headerDiv = await WaitForElement(`div.${findModule(e => e.ShowcaseHeader).ShowcaseHeader}`, popup.m_popup.document);
    const oldGridButton = headerDiv.querySelector('button.easygrid-button');
    if (!oldGridButton) {
        const gridButton = popup.m_popup.document.createElement("div");
        const gridButtonRoot = createRoot(gridButton);
        gridButtonRoot.render(<DialogButton className="easygrid-button" style={{width: "50px"}}>SGDB</DialogButton>);
        headerDiv.insertBefore(gridButton, headerDiv.firstChild.nextSibling.nextSibling);

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
                        if (currentColl.allApps[j].appid in excludedAppIDs) continue;
                        const newImage = await getImageData(currentColl.allApps[j].appid, 0, 0);
                        if (newImage) {
                            SteamClient.Apps.SetCustomArtworkForApp(currentColl.allApps[j].appid, newImage, 'png', 0);
                        }
                    }
                    gridButton.firstChild.innerHTML = "Done!";
                    console.log("[steam-easygrid 4] Grids replaced for", collId);
                }}> Replace grids of {collName} </MenuItem>);
                extraMenuItems.push(<MenuItem onClick={async () => {
                    const currentColl = collectionStore.GetCollection(collId);
                    for (let j = 0; j < currentColl.allApps.length; j++) {
                        gridButton.firstChild.innerHTML = `Working... (${j}/${currentColl.allApps.length})`;
                        SteamClient.Apps.ClearCustomArtworkForApp(currentColl.allApps[j].appid, 0);
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
    if (!oldGridButton) {
        const gridButton = popup.m_popup.document.createElement("div");
        const gridButtonRoot = createRoot(gridButton);
        gridButtonRoot.render(<DialogButton className="easygrid-button" style={{width: "50px"}}>SGDB</DialogButton>);
        collOptionsDiv.insertBefore(gridButton, collOptionsDiv.firstChild.nextSibling);

        gridButton.addEventListener("click", async () => {
            showContextMenu(
                <Menu label="EasyGrid Options">
                    <MenuItem onClick={async () => {
                        const currentColl = collectionStore.GetCollection(uiStore.currentGameListSelection.strCollectionId);
                        const excludedAppIDs = getExcludedAppIDs();
                        for (let j = 0; j < currentColl.allApps.length; j++) {
                            gridButton.firstChild.innerHTML = `Working... (${j}/${currentColl.allApps.length})`;
                            if (currentColl.allApps[j].appid in excludedAppIDs) continue;
                            const newImage = await getImageData(currentColl.allApps[j].appid, 0, 0);
                            if (newImage) {
                                SteamClient.Apps.SetCustomArtworkForApp(currentColl.allApps[j].appid, newImage, 'png', 0);
                            }
                        }
                        gridButton.firstChild.innerHTML = "Done!";
                        console.log("[steam-easygrid 4] Grids replaced for", uiStore.currentGameListSelection.strCollectionId);
                    }}> Replace grids </MenuItem>
                    <MenuItem onClick={async () => {
                        const currentColl = collectionStore.GetCollection(uiStore.currentGameListSelection.strCollectionId);
                        for (let j = 0; j < currentColl.allApps.length; j++) {
                            gridButton.firstChild.innerHTML = `Working... (${j}/${currentColl.allApps.length})`;
                            SteamClient.Apps.ClearCustomArtworkForApp(currentColl.allApps[j].appid, 0);
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

function getEasyGridComponent(popup: any) {
    return (props) => {
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
        };

        const imageStyle: React.CSSProperties = {
            width: '100%', // adjust as needed
            height: 'auto',
            objectFit: 'cover',
            borderRadius: '8px'
        };

        const [steamGridDBId, setSteamGridDBId] = useState<number>(-1);
        const [thumbnailList, setThumbnailList] = useState([]);

        const GetCurrentSettings = async () => {
            setSteamGridDBId(await getSteamGridDBId(props.appid));
            setThumbnailList(await getSearchData(props.appid, props.imagetype));
        };

        const PurgeImageCache = async () => {
            console.log("[steam-easygrid 4] Purging cache and reloading...");
            searchCache[props.appid.toString()] = {};
            GetCurrentSettings();
        };

        const SetNewImage = async (e) => {
            const targetNum = Number(e.target.dataset.imageindex);
            console.log("[steam-easygrid 4] Setting image to:", targetNum);
            const newImage = await getImageData(props.appid, props.imagetype, targetNum);
            if (newImage) {
                SteamClient.Apps.SetCustomArtworkForApp(props.appid, newImage, 'png', props.imagetype);
            }
        };

        const SetOriginalImage = async (e) => {
            console.log("[steam-easygrid 4] Resetting image...");
            SteamClient.Apps.ClearCustomArtworkForApp(props.appid, props.imagetype);
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
                <DialogButton style={{width: "120px", display: "inline-block"}} onClick={OpenWebpage}>Open Webpage</DialogButton><br/>
                <div style={containerStyle}>
                    {thumbnailList.map((thumbData, index) => {
                        if (thumbData["type"] === "static")
                            return (
                                <div style={imageWrapperStyle}>
                                    <img key={index} data-imageindex={index} src={thumbData["thumb"]} alt={thumbData["type"]} style={imageStyle} onClick={SetNewImage}/>
                                </div>
                            );

                        return (
                            <div style={imageWrapperStyle}>
                                <video key={index} data-imageindex={index} autoPlay loop muted playsInline src={thumbData["thumb"]} alt={thumbData["type"]} style={imageStyle} onClick={SetNewImage}/>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };
}

async function openSGDBWindow(popup: any) {
    const EasyGridComponent: React.FC = getEasyGridComponent(popup);

    const currentColl = collectionStore.GetCollection(uiStore.currentGameListSelection.strCollectionId);
    const currentApp = currentColl.allApps.find((x) => x.appid === uiStore.currentGameListSelection.nAppId);
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
        const oldGridButton = gameSettingsButton.parentNode.querySelector('div.easygrid-button');
        if (!oldGridButton) {
            const gridButton = gameSettingsButton.cloneNode(true);
            gridButton.classList.add("easygrid-button");
            gridButton.firstChild.innerHTML = "SG";
            gameSettingsButton.parentNode.insertBefore(gridButton, gameSettingsButton.nextSibling);

            gridButton.addEventListener("click", async () => {
                showContextMenu(
                    <Menu label="SGDB Options">
                        <MenuItem onClick={async () => {
                            const currentColl = collectionStore.GetCollection(uiStore.currentGameListSelection.strCollectionId);
                            const currentApp = currentColl.allApps.find((x) => x.appid === uiStore.currentGameListSelection.nAppId);

                            let allImageTypes = 4;
                            if (pluginConfig.icons_enabled) {
                                allImageTypes = 5;
                            }
                            for (let j = 0; j < allImageTypes; j++) {
                                gridButton.firstChild.innerHTML = `${j}/${allImageTypes}`;
                                const newImage = await getImageData(uiStore.currentGameListSelection.nAppId, j, 0);
                                if (newImage) {
                                    SteamClient.Apps.SetCustomArtworkForApp(uiStore.currentGameListSelection.nAppId, newImage, 'png', j);
                                }
                            }
                            gridButton.firstChild.innerHTML = "SG";
                            console.log("[steam-easygrid 4] Images replaced for", uiStore.currentGameListSelection.nAppId);
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

        topCapsuleDiv.style.setProperty("max-height", expandHeadersValue, "important");

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

    const topCapsuleDiv = await WaitForElement(`div.${findModule(e => e.TopCapsule).TopCapsule}`, popup.m_popup.document);
    const topCapsuleObserver = new MutationObserver(async (mutationList, observer) => {
        await renderApp(popup);
    });
    topCapsuleObserver.observe(topCapsuleDiv.parentNode, { subtree: true, childList: true, attributes: true });
}

async function OnPopupCreation(popup: any) {
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
        MainWindowBrowserManager.m_browser.on("finished-request", async (currentURL, previousURL) => {
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

const SingleSetting = (props) => {
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
                <TextField disabled={isDisabled} defaultValue={pluginConfig[props.parentname][props.name]} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { pluginConfig[props.parentname][props.name] = e.currentTarget.value; saveConfig(); }} />
            </Field>
        );
    } else if (props.type === "array") {
        return (
            <Field label={props.label} description={props.description} bottomSeparator="standard" focusable>
                <TextField disabled={isDisabled} defaultValue={pluginConfig[props.name].join(", ")} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { pluginConfig[props.name] = e.currentTarget.value.split(",").map(s => s.trim()).filter(s => s.length > 0); saveConfig(); }} />
            </Field>
        );
    }
}

const ImageSearchSetting = (props) => {
    return (
        <div>
            <SingleSetting name="nsfw" parentname={props.name} type="textchild" label={`${props.label} :: nsfw`} description="any | true | false" />
            <SingleSetting name="humor" parentname={props.name} type="textchild" label={`${props.label} :: humor`} description="any | true | false" />
            <SingleSetting name="epilepsy" parentname={props.name} type="textchild" label={`${props.label} :: epilepsy`} description="any | true | false" />
            <SingleSetting name="types" parentname={props.name} type="textchild" label={`${props.label} :: types`} description="Comma separated" />
            <SingleSetting name="styles" parentname={props.name} type="textchild" label={`${props.label} :: styles`} description="Comma separated" />
        </div>
    );
}

const SettingsContent = () => {
    return (
        <div>
            <SingleSetting name="api_key" type="text" label="API key" description="Your SteamGridDB API key" />
            <SingleSetting name="display_name_fallback" type="bool" label="Search by name fallback" description="Fallback to searching by name if needed" />
            <SingleSetting name="replace_custom_images" type="bool" readonly={true} label="Always replace cusmtom Images" description="When replacing all grid images, replace custom set ones as well" />
            <SingleSetting name="appids_excluded_from_replacement" type="text" label="Exclude APPIDs from replacement" description="When replacing all grid images, skip these apps (separate by semicolon)" />
            <SingleSetting name="prioritize_animated" type="bool" label="Prioritize animated images" description="Prioritize animated images" />
            <SingleSetting name="prioritize_authors" type="array" label="Prioritize Authors" description="Prioritize images by author (comma-separated, in order)" />
            <SingleSetting name="expand_headers" type="text" label="Expand app header size" description="Set custom header height" />
            <SingleSetting name="app_page_button" type="bool" label="Show SG button" description="Show SG button on application pages" />
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

async function pluginMain() {
    console.log("[steam-easygrid 4] frontend startup");
    await App.WaitForServicesInitialized();
    await sleep(100);

    while (
        typeof g_PopupManager === 'undefined' ||
        typeof MainWindowBrowserManager === 'undefined'
    ) {
        await sleep(100);
    }

    const storedConfig = JSON.parse(localStorage.getItem("luthor112.steam-easygrid.config"));
    pluginConfig = { ...pluginConfig, ...storedConfig };
    console.log("[steam-easygrid 4] Merged config:", pluginConfig);

    const storedOverrides = JSON.parse(localStorage.getItem("luthor112.steam-easygrid.overrides"));
    gameIDOverrides = { ...gameIDOverrides, ...storedOverrides };
    console.log("[steam-easygrid 4] Overrides:", gameIDOverrides);

    const doc = g_PopupManager.GetExistingPopup("SP Desktop_uid0");
	if (doc) {
		OnPopupCreation(doc);
	}

	g_PopupManager.AddPopupCreatedCallback(OnPopupCreation);
}

export default definePlugin(async () => {
    await pluginMain();
    return {
        title: "Easy SteamGrid",
        icon: <IconsModule.Settings />,
        content: <SettingsContent />,
    };
});
