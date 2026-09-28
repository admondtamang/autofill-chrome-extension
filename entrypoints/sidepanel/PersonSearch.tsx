import { useEffect, useRef, useState } from 'preact/hooks';
import { EntityType, type PersonSummary } from '@/lib/schema';
import { send } from './messaging';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Check,
  cn,
  Empty,
  ErrorNote,
  Input,
  Label,
  Loading,
  Search,
  Select,
  X,
} from './ui';

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
    <Card onKeyDown={onKeyDown}>
      <CardHeader title="Person">
        {selected !== null && (
          <Badge variant="secondary">
            <Check />
            Selected
          </Badge>
        )}
      </CardHeader>

      <div class="flex min-w-0 items-end gap-2">
        <div class="w-[38%] shrink-0">
          <Label for="entity-type">Type</Label>
          <Select
            id="entity-type"
            data-testid="entity-type"
            value={type}
            onChange={(e) => setType((e.currentTarget as HTMLSelectElement).value as EntityType)}
          >
            {EntityType.options.map((t) => (
              <option key={t} value={t}>
                {LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
        <div class="min-w-0 flex-1">
          <Label for="person-q">Search</Label>
          <div class="relative min-w-0">
            <Search class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="person-q"
              data-testid="person-search"
              class="pl-8"
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
      </div>

      {error !== null && <ErrorNote>{error}</ErrorNote>}

      {error === null && loading && <Loading>Searching {LABELS[type].toLowerCase()}s…</Loading>}

      {error === null && !loading && results.length === 0 && (
        <Empty icon={<Search class="size-5" />} data-testid="no-results">
          No {LABELS[type].toLowerCase()} matches{q.trim() ? ` “${q.trim()}”` : ''}.
        </Empty>
      )}

      {/* A plain <ul> so `ref` reaches a real node: Preact does not forward `ref`
          into a function component, and the arrow-key cursor needs the real node. */}
      {results.length > 0 && (
        <ul
          class={cn(
            // Taller rows would otherwise show fewer people in the same box.
            'm-0 flex max-h-80 min-w-0 list-none flex-col overflow-x-hidden overflow-y-auto',
            'overscroll-contain rounded-lg border p-0',
          )}
          id="person-results"
          role="listbox"
          aria-label="Search results"
          ref={listRef}
        >
          {results.map((p, i) => {
            const chosen = selected !== null && keyOf(selected) === keyOf(p);
            return (
              <li
                key={keyOf(p)}
                class={[
                  // A row stacks up to three lines (name, status, email), so it
                  // needs real vertical room — py-2 + leading-tight read as cramped.
                  'relative flex min-h-16 min-w-0 cursor-pointer items-center gap-2',
                  'border-b px-3 py-3 transition-colors last:border-b-0',
                  i === active ? 'bg-accent' : 'hover:bg-accent/60',
                  chosen ? 'bg-accent' : '',
                ].join(' ')}
                data-testid="person-result"
                role="option"
                tabIndex={-1}
                aria-selected={chosen}
                onClick={() => onSelect(p)}
                onMouseEnter={() => setActive(i)}
              >
                {chosen && (
                  <span aria-hidden="true" class="absolute inset-y-0 left-0 w-0.5 bg-primary" />
                )}
                <span class="flex min-w-0 flex-1 flex-col gap-0.5 leading-snug">
                  <span
                    class={`block truncate ${chosen ? 'font-semibold' : 'font-medium'}`}
                    title={p.displayName}
                  >
                    {p.displayName}
                  </span>
                  {p.subtitle !== null && (
                    <span class="block truncate text-xs text-muted-foreground" title={p.subtitle}>
                      {p.subtitle}
                    </span>
                  )}
                  {p.email !== null && (
                    <span class="block truncate text-xs text-muted-foreground" title={p.email}>
                      {p.email}
                    </span>
                  )}
                </span>
                {chosen && <Check class="shrink-0 text-primary" />}
              </li>
            );
          })}
        </ul>
      )}

      {selected !== null && (
        <div
          class="flex min-w-0 items-center gap-2 rounded-lg border border-primary/25 bg-accent px-3 py-2"
          data-testid="selected-person"
        >
          <span class="min-w-0 flex-1 leading-tight">
            <span class="block truncate font-semibold" title={selected.displayName}>
              {selected.displayName}
            </span>
            <span class="block truncate text-xs text-muted-foreground">
              {LABELS[selected.personRef.type]} #{selected.personRef.id}
            </span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            class="px-2"
            data-testid="clear-person"
            title="Clear the selected person"
            onClick={() => onSelect(null)}
          >
            <X />
            <span class="sr-only">Clear</span>
          </Button>
        </div>
      )}
    </Card>
  );
}
