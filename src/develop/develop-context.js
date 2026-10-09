import { createContext, useContext } from 'react'
export const DevelopContext = createContext(null)
export const useDevelop = () => useContext(DevelopContext)
