import { beforeEach, describe, expect, it, vi } from 'vitest';
import { payloadPaths, startRecording } from '@/lib/record';
import { FieldMapping } from '@/lib/schema';

const click = (selector: string) => {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`no element for ${selector}`);
  const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev;
};

beforeEach(() => {
  document.body.innerHTML = `
    <form id="f" onsubmit="return false">
      <label for="given">Given name</label>
      <input type="text" id="given" name="given">
      <label>Occupation <input type="text" class="hashed"></label>
      <label for="country">Country of citizenship</label>
      <select id="country" name="country"><option value="NPL">NEPAL</option></select>
      <label><input type="checkbox" id="declaration" name="declaration"> I declare this is correct.</label>
      <button type="submit" id="next">Next</button>
      <input type="submit" id="pay" value="Pay">
    </form>`;
});

describe('startRecording', () => {
  it('captures a clicked control as a FieldMapping draft and swallows the click', () => {
    const seen: FieldMapping[] = [];
    const stop = startRecording((f) => seen.push(f));

    const ev = click('#given');
    expect(ev.defaultPrevented).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ path: '', selector: '#given', type: 'text', required: false });
    expect(seen[0]?.fallbackLabel).toBe('Given name');
    expect(() => FieldMapping.parse(seen[0])).not.toThrow();

    stop();
    click('#given');
    expect(seen).toHaveLength(1); // listener removed
  });

  it('infers select type and falls back to the wrapping label text', () => {
    const seen: FieldMapping[] = [];
    const stop = startRecording((f) => seen.push(f));
    click('#country');
    click('.hashed');
    stop();

    expect(seen[0]).toMatchObject({ selector: '#country', type: 'select' });
    expect(seen[1]?.fallbackLabel).toBe('Occupation');
    expect(seen[1]?.selector).toMatch(/^body > /); // no id, no name → structural selector
  });

  it('refuses declaration, next and pay controls', () => {
    const onCapture = vi.fn();
    const stop = startRecording(onCapture);
    for (const sel of ['#declaration', '#next', '#pay']) click(sel);
    stop();
    expect(onCapture).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLInputElement>('#declaration')?.checked).toBe(false);
  });

  it('has exactly one call shape — the content script\'s (CONTRACTS \u00a75)', () => {
    // Mirrors entrypoints/content.ts: startRecording(cb) and nothing else.
    const seen: FieldMapping[] = [];
    const call: (onCapture: (f: FieldMapping) => void) => () => void = startRecording;
    const stop = call((field: FieldMapping) => seen.push(field));
    click('#given');
    stop();
    expect(seen).toHaveLength(1);

    // @ts-expect-error the (paths, callback) overload is gone
    startRecording(payloadPaths(), (f: FieldMapping) => seen.push(f))();
    expect(seen).toHaveLength(1);
  });
});

describe('payloadPaths', () => {
  it('is derived from the Zod schema, including array item paths', () => {
    const paths = payloadPaths();
    for (const p of [
      'name.given',
      'name.middle',
      'dob',
      'contact.email',
      'passport.number',
      'citizenship.label',
      'currentVisa.expires',
      'address.residential',
      'location',
      'employment.occupation',
      'education.highest',
      'serviceTypes',
      'addressHistory[].street',
      'addressHistory[].from',
    ]) {
      expect(paths).toContain(p);
    }
    expect(paths).not.toContain('addressHistory');
    expect(new Set(paths).size).toBe(paths.length);
  });
});
