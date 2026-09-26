import { useEffect, useRef, useState } from 'preact/hooks';
import { EntityType, type PersonSummary } from '@/lib/schema';
import { send } from './messaging';

const LABELS: Record<EntityType, string> = {
  lead: 'Lead',
  student: 'Student',
  education: 'Education',
  visa: 'Visa',
  'skill-assessment': 'Skill assessment',
  tribunal: 'Tribunal',
  insurance: 'Insurance',
};

const keyOf = (p: PersonSummary): string => `${p.personRef.type}:${p.personRef.id}`;

type Props = {
  selected: PersonSummary | null;
  onSelect: (p: PersonSummary | null) => void;
};

export function PersonSearch({ selected, onSelect }: Props) {
  const [type, setType] = useState<EntityType>('lead');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PersonSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  // Debounced search. A stale response never overwrites a newer one.
  useEffect(() => {
    let live = true;
    setLoading(true);
    const t = setTimeout(() => {
      void send({ kind: 'SEARCH', type, q }).then((res) => {
        if (!live) return;
        setLoading(false);
        setActive(0);
        if (res.ok) {
          setError(null);
          setResults(res.data);
        } else {
          setError(res.error);
          setResults([]);
        }
      });
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [type, q]);

  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onKeyDown = (e: KeyboardEvent): void => {
    if (results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = results[active];
      if (hit) onSelect(hit);
    }
  };

  return (
    <section class="card" onKeyDown={onKeyDown}>
      <div class="card__head">
        <h2 class="section" id="person-h">Person</h2>
      </div>

      <div class="row">
        <div style="flex:0 0 40%">
          <label class="field" for="entity-type">Type</label>
          <select
            id="entity-type"
            data-testid="entity-type"
            value={type}
            onChange={(e) => setType((e.currentTarget as HTMLSelectElement).value as EntityType)}
          >
            {EntityType.options.map((t) => (
              <option key={t} value={t}>{LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div class="grow">
          <label class="field" for="person-q">Search</label>
          <input
            id="person-q"
            data-testid="person-search"
            type="search"
            placeholder="Name or email"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="person-results"
            value={q}
            onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)}
          />
        </div>
      </div>

      {error !== null && <p class="error" role="alert">{error}</p>}

      {error === null && loading && <p class="hint">Searching…</p>}

      {error === null && !loading && results.length === 0 && (
        <p class="hint" data-testid="no-results">
          No {LABELS[type].toLowerCase()} matches{q.trim() ? ` “${q.trim()}”` : ''}.
        </p>
      )}

      {results.length > 0 && (
        <ul
          class="results"
          id="person-results"
          role="listbox"
          aria-labelledby="person-h"
          ref={listRef}
        >
          {results.map((p, i) => (
            <li
              key={keyOf(p)}
              class={`result${i === active ? ' active' : ''}`}
              data-testid="person-result"
              role="option"
              tabIndex={-1}
              aria-selected={selected !== null && keyOf(selected) === keyOf(p)}
              onClick={() => onSelect(p)}
              onMouseEnter={() => setActive(i)}
            >
              <div class="result__name">{p.displayName}</div>
              {p.subtitle !== null && <div class="result__meta">{p.subtitle}</div>}
              {p.email !== null && <div class="result__meta">{p.email}</div>}
            </li>
          ))}
        </ul>
      )}

      {selected !== null && (
        <div class="chosen" data-testid="selected-person">
          <div>
            <div class="result__name">{selected.displayName}</div>
            <div class="result__meta">
              {LABELS[selected.personRef.type]} #{selected.personRef.id}
            </div>
          </div>
          <button class="small" data-testid="clear-person" onClick={() => onSelect(null)}>
            Clear
          </button>
        </div>
      )}
    </section>
  );
}
