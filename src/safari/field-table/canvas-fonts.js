import { defaultEditorAssetUrls } from 'tldraw'

// Keep the legacy font keys so saved/shared boards need no document migration.
// Their font files are plain sans-serif, including the faces embedded in exports.
export const CANVAS_ASSET_URLS = {
  fonts: {
    tldraw_draw: defaultEditorAssetUrls.fonts.tldraw_sans,
    tldraw_draw_bold: defaultEditorAssetUrls.fonts.tldraw_sans_bold,
    tldraw_draw_italic: defaultEditorAssetUrls.fonts.tldraw_sans_italic,
    tldraw_draw_italic_bold: defaultEditorAssetUrls.fonts.tldraw_sans_italic_bold,
  },
}
