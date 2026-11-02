import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import LineSidebar from './LineSidebar.jsx';
import './integration.css';

// These islands only present the snapshot produced by app.js. Supabase and all
// financial rules remain in the original application and finance-core.js.
const sections = [
  { label: 'Visão geral', id: 'inicio', icon: 'ico-home' },
  { label: 'Movimentações', id: 'historico', icon: 'ico-arrows' },
  { label: 'Categorias', id: 'categorias', icon: 'ico-chart' },
  { label: 'Relatórios', id: 'relatorios', icon: 'ico-calendar' }
];
const labels = sections.map(section => section.label);

function readPreference(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function remember(key, value) {
  try { localStorage.setItem(key, value); } catch { /* Storage can be unavailable. */ }
}
function useReducedMotion() {
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  return reduced;
}
function Navigation() {
  const reduced = useReducedMotion();
  const [initial] = useState(() => {
    const remembered = readPreference('vio-secao', 'inicio');
    const index = sections.findIndex(section => section.id === remembered);
    return Math.max(0, index);
  });
  const [active, setActive] = useState(initial);
  useEffect(() => {
    let lastIndex = -1;
    const updateActiveSection = () => {
      const top = window.scrollY + 180;
      const index = sections.reduce((current, section, candidate) => {
        const element = document.getElementById(section.id);
        return element && element.getBoundingClientRect().top + window.scrollY <= top ? candidate : current;
      }, 0);
      if (index !== lastIndex) {
        lastIndex = index;
        setActive(index);
        remember('vio-secao', sections[index].id);
      }
    };
    window.addEventListener('scroll', updateActiveSection, { passive: true });
    updateActiveSection();
    return () => window.removeEventListener('scroll', updateActiveSection);
  }, []);
  return <LineSidebar
    items={labels}
    icons={sections.map(section => section.icon)}
    accentColor="var(--accent)"
    textColor="var(--muted)"
    markerColor="var(--border)"
    defaultActive={initial}
    activeIndex={active}
    showIndex={false}
    markerLength={12}
    markerGap={8}
    maxShift={reduced ? 0 : 3}
    fontSize={0.8}
    itemGap={5}
    smoothing={reduced ? 0 : 100}
    scaleTick={!reduced}
    onItemClick={index => {
      const section = sections[index];
      setActive(index);
      remember('vio-secao', section.id);
      document.getElementById(section.id)?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'start' });
    }}
  />;
}
const sidebar = document.getElementById('line-sidebar-root');
if (sidebar) createRoot(sidebar).render(<Navigation />);
