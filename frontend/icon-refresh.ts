let mainWindowPopup: any;

export function setIconRefreshPopup(popup: any) {
    mainWindowPopup = popup;
}

export function refreshAppIconImages(appId: number) {
    const doc: Document | undefined = mainWindowPopup?.m_popup?.document;
    const iconHash = appStore.GetAppOverviewByAppID(appId)?.icon_hash;
    if (!doc || !iconHash) return;

    const marker = `/assets/${appId}/${iconHash}.jpg`;
    for (const img of Array.from(doc.querySelectorAll("img")) as HTMLImageElement[]) {
        const src = img.currentSrc || img.src;
        if (!src.includes(marker)) continue;

        const url = new URL(src);
        url.searchParams.set("egr", String(Date.now()));
        img.src = url.toString();
    }
}
