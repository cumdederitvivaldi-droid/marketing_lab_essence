import { loadDisposalGuideConfigWithDiagnostics } from '../src/lib/loadGuideConfig';
import { writeFileSync } from 'fs';

async function main() {
  const { diagnostics } = await loadDisposalGuideConfigWithDiagnostics({ forceRefresh: true });
  const strict = diagnostics.requestedMode === 'supabase_strict';
  const strictOk =
    diagnostics.ok &&
    diagnostics.resolvedSource === 'supabase' &&
    diagnostics.validationStatus === 'valid' &&
    Boolean(diagnostics.configChecksum);
  const ok = strict ? strictOk : diagnostics.ok;

  console.log(JSON.stringify(diagnostics, null, 2));
  if (process.env.GUIDE_CONFIG_DIAGNOSTICS_FILE) {
    writeFileSync(
      process.env.GUIDE_CONFIG_DIAGNOSTICS_FILE,
      `${JSON.stringify(diagnostics, null, 2)}\n`,
      'utf8',
    );
  }

  if (!ok) {
    console.error(
      `Guide config validation failed: mode=${diagnostics.requestedMode}, source=${diagnostics.resolvedSource}, status=${diagnostics.validationStatus}, errors=${diagnostics.validationErrorCodes.join(',')}`,
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Guide config validation failed unexpectedly', error);
  process.exit(1);
});
