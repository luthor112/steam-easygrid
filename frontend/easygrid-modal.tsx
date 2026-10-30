import { SidebarNavigation, ModalRoot, findModuleExport, routerHook, EUIMode, DialogButton, TextField, Focusable, Navigation, showModal, sleep } from "@steambrew/client";
import { clear_icon } from "./backend";
import { refreshAppIconImages } from "./icon-refresh";
import { pluginConfig, gameIDOverrides, searchCache, imgTypeSettingsMap, ICON_IMG_TYPE, SetCustomizationState, persistConfig } from "./config";
import { getSteamGridDBId, getSearchData, applyIconFromUrlWithReason, isShortcut, resetShortcutIcon, getImageData, getImageExt } from "./api";
import { ImageSearchSetting, GlobalSettingsPage, useImageTypeReset } from "./settings-components";
import React, { useState, useEffect, useRef } from "react";

type GetEasyGridComponentProps = {
    appid: number;
    appname: string;
    imagetype: number;
};

function getEasyGridComponent(windowRef: Window) {
    return (props: GetEasyGridComponentProps) => {
        const typeSettings = imgTypeSettingsMap[props.imagetype];
        const imageWidthMult = pluginConfig[typeSettings.widthMultKey] / 100;
        const [windowWidth, setWindowWidth] = useState(windowRef.innerWidth);

        useEffect(() => {
            const handleResize = () => setWindowWidth(windowRef.innerWidth);
            windowRef.addEventListener('resize', handleResize);
            return () => windowRef.removeEventListener('resize', handleResize);
        }, []);

        const containerStyle: React.CSSProperties = {
            display: 'flex',
            flexWrap: 'wrap',
            overflowX: 'hidden',
            overflowY: 'auto',
            padding: '10px',
            boxSizing: 'border-box',
            gap: '10px',
            width: '100%',
            flex: 1,
            minHeight: 0,
            alignContent: 'flex-start'
        };

        const imageWrapperStyle: React.CSSProperties = {
            width: (windowWidth * imageWidthMult) + 'px',
            minWidth: "150px",
            height: "auto",
            position: 'relative',
            display: 'inline-block'
        };

        const imageStyle: React.CSSProperties = {
            width: '100%',
            height: 'auto',
            objectFit: 'cover',
            borderRadius: '8px',
            display: 'block'
        };

        const statusStyle: React.CSSProperties = {
            display: 'none',
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'calc(100% - 16px)',
            boxSizing: 'border-box',
            padding: '6px 8px',
            borderRadius: '8px',
            background: 'rgba(0, 0, 0, 0.8)',
            textAlign: 'center',
            fontWeight: 'bold',
            pointerEvents: "none",
        };

        const STATUS_COLORS = { working: '#c8c8c8', done: '#7ee787', warning: '#ffb454', failed: '#ff7b72' };

        const clearStatus = (el: HTMLElement | null | undefined) => {
            if (!el) return;
            el.replaceChildren();
            el.style.display = 'none';
        };

        const showStatus = (el: HTMLElement | null | undefined, headline: string, color: string, detail?: string) => {
            if (!el) return;
            el.replaceChildren();

            const headlineEl = el.ownerDocument.createElement('div');
            headlineEl.textContent = headline;
            headlineEl.style.fontSize = '18px';
            headlineEl.style.color = color;
            el.appendChild(headlineEl);

            if (detail) {
                const detailEl = el.ownerDocument.createElement('div');
                detailEl.textContent = detail.charAt(0).toUpperCase() + detail.slice(1);
                detailEl.style.fontSize = '12px';
                detailEl.style.fontWeight = 'normal';
                detailEl.style.color = '#e8e8e8';
                detailEl.style.marginTop = '4px';
                detailEl.style.overflowWrap = 'anywhere';
                el.appendChild(detailEl);
            }

            el.style.display = 'block';
        };

        const [steamGridDBId, setSteamGridDBId] = useState<number>(-1);
        const [thumbnailList, setThumbnailList] = useState([]);
        const [sgdbIdInput, setSteamGridDBIdInput] = useState<string>("");
        const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
        const [settingsHidden, setSettingsHidden] = useState(pluginConfig.hide_type_settings);

        const ToggleSettingsHidden = () => {
            const next = !settingsHidden;
            setSettingsHidden(next);
            pluginConfig.hide_type_settings = next;
            persistConfig();
        };

        const GetCurrentSettings = async () => {
            const id = await getSteamGridDBId(props.appid);
            setSteamGridDBId(id !== undefined ? id : -1);
            setSteamGridDBIdInput(id !== undefined ? id.toString() : "");
            setThumbnailList(await getSearchData(props.appid, props.imagetype));
        };

        const [settingsResetVersion, resetTypeSettings] = useImageTypeReset(props.imagetype, GetCurrentSettings);

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

        const statusRefs = useRef<(HTMLElement | null)[]>([]);

        const SetNewImage = async (index: number) => {
            console.log("[steam-easygrid 4] Setting image to:", index);
            statusRefs.current.forEach(clearStatus);
            const statusEl = statusRefs.current[index];
            showStatus(statusEl, "DOWNLOADING", STATUS_COLORS.working);

            let success: boolean;
            let failureReason = "";
            if (props.imagetype === ICON_IMG_TYPE) {
                const searchResults = await getSearchData(props.appid, props.imagetype);
                const imgURL = searchResults?.[index]?.url;
                failureReason = imgURL ? await applyIconFromUrlWithReason(props.appid, imgURL) : "there is no icon to apply";
                success = failureReason === "";
            } else {
                const newImage = await getImageData(props.appid, props.imagetype, index);
                success = !!newImage;
                if (newImage) {
                    const imageExt = await getImageExt(props.appid, props.imagetype, index);
                    await SteamClient.Apps.ClearCustomArtworkForApp(props.appid, props.imagetype);
                    SteamClient.Apps.SetCustomArtworkForApp(props.appid, newImage, imageExt!, props.imagetype);
                }
            }

            if (!success) {
                showStatus(statusEl, "FAILED", STATUS_COLORS.failed, failureReason);
            } else if (props.imagetype === ICON_IMG_TYPE && !isShortcut(props.appid) && !appStore.GetAppOverviewByAppID(props.appid)?.icon_hash) {
                showStatus(statusEl, "SAVED", STATUS_COLORS.warning, "Steam may not show icons for this game");
            } else {
                showStatus(statusEl, "DONE", STATUS_COLORS.done);
            }

            if (success) {
                SetCustomizationState(props.appid, props.imagetype, true);
            }
        };

        const SetOriginalImage = async () => {
            console.log("[steam-easygrid 4] Resetting image...");
            if (props.imagetype === ICON_IMG_TYPE) {
                resetShortcutIcon(props.appid);
                await clear_icon({ a_appid: props.appid });
                refreshAppIconImages(props.appid);
            } else {
                SteamClient.Apps.ClearCustomArtworkForApp(props.appid, props.imagetype);
            }
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
            <Focusable style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0, maxWidth: '100%' }} flow-children="column">
                <div>
                    App ID: {props.appid} / SGDB ID: {steamGridDBId} / Image Type: {props.imagetype} (found {thumbnailList.length}) <br/>
                    <Focusable
                        style={{ display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', gap: '10px', overflowX: 'auto', overflowY: 'hidden', width: '100%', padding: '4px 0' }}
                        flow-children="row"
                    >
                        <DialogButton style={{width: "120px", flexShrink: 0}} onClick={SetOriginalImage}>Reset</DialogButton>
                        <DialogButton style={{width: "120px", flexShrink: 0}} onClick={PurgeImageCache}>Purge Cache</DialogButton>
                        <DialogButton style={{width: "120px", flexShrink: 0}} onClick={OpenWebpage}>Open Webpage</DialogButton>
                        <div style={{width: "150px", flexShrink: 0}}><TextField value={sgdbIdInput} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSteamGridDBIdInput(e.currentTarget.value)} mustBeNumeric={true} /></div>
                        <DialogButton style={{width: "120px", flexShrink: 0}} onClick={SetSteamGridDBIdOverride}>Set SGDB ID</DialogButton>
                        <DialogButton style={{width: "120px", flexShrink: 0}} onClick={ClearSteamGridDBIdOverride}>Clear SGDB ID</DialogButton>
                        <DialogButton style={{width: "120px", flexShrink: 0}} onClick={ToggleSettingsHidden}>{settingsHidden ? "Show Settings" : "Hide Settings"}</DialogButton>
                        <DialogButton style={{width: "160px", flexShrink: 0}} onClick={resetTypeSettings}>Reset {typeSettings.label} Settings</DialogButton>
                    </Focusable>
                    <br/>
                    {!settingsHidden && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '4px 12px' }}>
                            <ImageSearchSetting imgType={props.imagetype} label={typeSettings.label} resetVersion={settingsResetVersion} onSaved={GetCurrentSettings} useTooltip hideTypePrefix />
                        </div>
                    )}
                </div>
                <Focusable style={containerStyle} flow-children="grid">
                    {thumbnailList.map((thumbData, index) => {
                        const isFocused = focusedIndex === index;
                        const focusedImageStyle: React.CSSProperties = isFocused ? {
                            ...imageStyle,
                            boxShadow: '0 0 0 3px #66c0f4',
                            transform: 'scale(1.05)',
                            transition: 'transform 0.1s ease-out',
                        } : { ...imageStyle, transition: 'transform 0.1s ease-out' };

                        return (
                            <div style={imageWrapperStyle} key={index}>
                                <Focusable
                                    tabIndex={0}
                                    noFocusRing
                                    onActivate={() => void SetNewImage(index)}
                                    onClick={() => void SetNewImage(index)}
                                    onFocus={() => setFocusedIndex(index)}
                                    onBlur={() => setFocusedIndex((current) => current === index ? null : current)}
                                >
                                    {thumbData["type"] === "static" ? (
                                        <img data-imageindex={index} src={thumbData["thumb"]} alt={thumbData["type"]} style={focusedImageStyle}/>
                                    ) : (
                                        <video autoPlay loop muted playsInline src={thumbData["thumb"]} title={thumbData["type"]} style={focusedImageStyle}/>
                                    )}
                                </Focusable>
                                <div ref={(el) => { statusRefs.current[index] = el; }} className="easygrid-status" style={statusStyle}></div>
                            </div>
                        );
                    })}
                </Focusable>
            </Focusable>
        );
    };
}

function buildEasyGridPages(appid: number, appname: string, windowRef: Window) {
    const EasyGridComponent = getEasyGridComponent(windowRef);

    return [
        {title: <div>Hero</div>, content: <EasyGridComponent key="hero_page" appid={appid} appname={appname} imagetype={1}/>},
        {title: <div>Logo</div>, content: <EasyGridComponent key="logo_page" appid={appid} appname={appname} imagetype={2}/>},
        {title: <div>Grid</div>, content: <EasyGridComponent key="grid_page" appid={appid} appname={appname} imagetype={0}/>},
        {title: <div>Wide Grid</div>, content: <EasyGridComponent key="widegrid_page" appid={appid} appname={appname} imagetype={3}/>},
        {title: <div>Icon</div>, content: <EasyGridComponent key="icon_page" appid={appid} appname={appname} imagetype={4}/>},
        {title: <div>Settings</div>, content: <GlobalSettingsPage/>},
    ];
}

const ResizablePopupWindowComponent = findModuleExport((e: any) =>
    typeof e === 'function' &&
    e?.toString &&
    e.toString().includes('.popupHeight') &&
    e.toString().includes('.popupWidth') &&
    e.toString().includes('.onlyPopoutIfNeeded')
) as React.FC<any> | undefined;

type EasyGridPopupState = {
    open: boolean;
    content: React.ReactNode;
    options?: { strTitle: string; popupWidth: number; popupHeight: number; minWidth?: number; minHeight?: number; saveDimensionsKey?: string };
};

let easyGridPopupState: EasyGridPopupState = { open: false, content: null };
const easyGridPopupListeners = new Set<() => void>();

function setEasyGridPopupState(next: Partial<EasyGridPopupState>) {
    easyGridPopupState = { ...easyGridPopupState, ...next };
    easyGridPopupListeners.forEach((listener) => listener());
}

function EasyGridResizablePopupController() {
    const [, forceRender] = useState(0);
    useEffect(() => {
        const listener = () => forceRender((n) => n + 1);
        easyGridPopupListeners.add(listener);
        return () => { easyGridPopupListeners.delete(listener); };
    }, []);

    if (!easyGridPopupState.open || !ResizablePopupWindowComponent) return null;

    const handleClose = () => setEasyGridPopupState({ open: false, content: null });
    return (
        <ResizablePopupWindowComponent modal={false} resizable {...easyGridPopupState.options} onDismiss={handleClose}>
            <ModalRoot onCancel={handleClose}>{easyGridPopupState.content}</ModalRoot>
        </ResizablePopupWindowComponent>
    );
}

if (ResizablePopupWindowComponent) {
    routerHook.addGlobalComponent("EasyGridResizablePopup", EasyGridResizablePopupController, EUIMode.Desktop);
}

type EasyGridNavPage = { title: React.ReactNode; content: React.ReactNode };

function ResizableSidebarNavigation({ pages, title }: { pages: EasyGridNavPage[]; title: string }) {
    const anchorRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const doc = anchorRef.current?.ownerDocument;
        if (!doc || doc.getElementById("easygrid-resizable-fill-css")) return;
        const style = doc.createElement("style");
        style.id = "easygrid-resizable-fill-css";
        style.textContent = `
            ._2sssIwe0duyIrFvat2oXzH {
                height: 100% !important;
            }
            ._2kwFFHckg8jvnwJfg9-la8,
            .DialogContentTransition,
            .DialogContent,
            .DialogContent_InnerWidth {
                height: auto !important;
                flex: 1 1 auto !important;
                min-height: 0 !important;
            }
            .DialogContent_InnerWidth {
                display: flex !important;
                flex-direction: column !important;
            }
            .CFTLX2wIKOK3hNV-fS7_V.DesktopUI,
            .DesktopUI .CFTLX2wIKOK3hNV-fS7_V {
                padding-inline-end: 24px !important;
            }
        `;
        doc.head.appendChild(style);
    }, []);

    return (
        <div ref={anchorRef} style={{ height: '100%', flex: 1, minHeight: 0 }}>
            <SidebarNavigation pages={pages} showTitle={true} title={title} />
        </div>
    );
}

export async function openEasyGridWindow(appid: number, appname: string, windowRef: Window) {
    const modalPages = buildEasyGridPages(appid, appname, windowRef);

    if (ResizablePopupWindowComponent) {
        if (easyGridPopupState.open) {
            setEasyGridPopupState({ open: false, content: null });
            await sleep(50);
        }
        setEasyGridPopupState({
            open: true,
            content: <ResizableSidebarNavigation pages={modalPages} title={appname} />,
            options: {
                strTitle: "EasyGrid",
                popupWidth: 1500,
                popupHeight: 700,
                minWidth: 800,
                minHeight: 500,
                saveDimensionsKey: "easygrid_popup",
            },
        });
    } else {
        console.warn("[steam-easygrid 4] Resizable popup component not found, falling back to fixed-size modal");
        showModal(
            <SidebarNavigation pages={modalPages} showTitle={true} title={appname}/>,
            windowRef, {strTitle: "EasyGrid", bHideMainWindowForPopouts: false, bForcePopOut: true, popupHeight: 700, popupWidth: 1500}
        );
    }
}

export async function openSGDBWindow(popup: any) {
    const currentColl = collectionStore.GetCollection(uiStore.currentGameListSelection.strCollectionId);
    const currentApp = currentColl.allApps.find((x: any) => x.appid === uiStore.currentGameListSelection.nAppId);
    await openEasyGridWindow(uiStore.currentGameListSelection.nAppId, currentApp.display_name, popup.m_popup.window);
}

export let desktopPopup: any;

export function setDesktopPopup(popup: any) {
    desktopPopup = popup;
}

let pendingEasyGridApp: { appid: number; appname: string } | undefined;

export const EasyGridRouteContent = () => {
    if (!pendingEasyGridApp) {
        return <div>No app selected.</div>;
    }
    const { appid, appname } = pendingEasyGridApp;
    const modalPages = buildEasyGridPages(appid, appname, window);
    return <SidebarNavigation pages={modalPages} showTitle={true} title={appname}/>;
};

export async function openEasyGridForApp(appid: number) {
    const app = appStore.allApps.find((x: any) => x.appid === appid);
    const appname = app?.display_name ?? `App ${appid}`;

    const uiMode = await SteamClient.UI.GetUIMode().catch(() => EUIMode.Desktop);
    if (uiMode === EUIMode.GamePad) {
        pendingEasyGridApp = { appid, appname };
        Navigation.Navigate('/easygrid');
        return;
    }

    await openEasyGridWindow(appid, appname, desktopPopup?.m_popup?.window ?? window);
}
