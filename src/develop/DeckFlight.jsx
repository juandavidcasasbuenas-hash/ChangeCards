import { CARDS, CATEGORIES } from './catalog.js'
import { ChangeCardDoodle } from './ChangeShapes.jsx'
import './deck-flight.css'

// The document already contains the final card. Only this local paper travels,
// so a draw is one undoable edit and never streams animation frames to peers.
export default function DeckFlight({ deal }) {
  if (!deal) return null
  const card = CARDS.find(item => item.id === deal.cardId)
  const category = CATEGORIES.find(item => item.id === card.category)
  return <div className="dv-card-flight" key={deal.shapeId} aria-hidden="true" style={{
    left: deal.end.x, top: deal.end.y,
    '--flight-x': `${deal.start.x - deal.end.x}px`, '--flight-y': `${deal.start.y - deal.end.y}px`,
    '--flight-lift': `${Math.min(deal.start.y - deal.end.y, 0) - 65}px`,
    '--flight-scale-from': deal.start.w / 300, '--flight-scale-to': deal.end.w / 300,
    '--dvc-color': category.color,
  }}>
    <article className="dvc-card dvc-card-front"><header className="dvc-card-meta"><span>{card.label}</span><span>Fresh from the pile</span></header>
      <div className="dvc-card-art"><ChangeCardDoodle cardId={card.id}/></div><h2>{card.title}</h2>
      <footer className="dvc-card-front-footer"><span>Change Cards</span><span>Turn over ↻</span></footer>
    </article>
  </div>
}
