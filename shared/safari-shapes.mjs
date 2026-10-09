import { T } from '@tldraw/validate'

// One definition for the editor and the sync server. Evidence travels with the
// shape so moving, copying or grouping a finding always keeps its references.
export const evidenceProps = { w: T.number, h: T.number, evidence: T.jsonValue }
export const sourceProps = { ...evidenceProps, findingShapeId: T.string }
export const stationProps = { w: T.number, h: T.number, lens: T.string }
export const safariShapeSchemas = {
  'safari-evidence-card': { props: evidenceProps },
  'safari-source-card': { props: sourceProps },
  'safari-trail': { props: stationProps },
  'safari-station': { props: stationProps },
}
