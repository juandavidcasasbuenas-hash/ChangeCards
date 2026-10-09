import { createContext, useContext } from 'react'

export const SafariCanvasContext = createContext(null)
export const useSafariCanvas = () => useContext(SafariCanvasContext)
