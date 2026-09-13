import { describe, expect, it } from 'vitest';
import { createPortableProject, parsePortableProject } from '../../lib/tactics/assets';
import { createEmptyProject } from '../../lib/tactics/constants';

describe('progetti portabili', () => {
  it('crea e rilegge un documento versione 2', () => {
    const project = createEmptyProject();
    const portable = createPortableProject(project, []);
    expect(parsePortableProject(portable).project.id).toBe(project.id);
  });

  it('rifiuta documenti incompatibili', () => {
    expect(() => parsePortableProject({ kind: 'altro', version: 1 })).toThrow(/non valido/i);
  });
});
