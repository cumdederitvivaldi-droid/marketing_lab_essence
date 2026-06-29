import { buildPolicyMatrix } from './policyMatrix';

describe('policy matrix', () => {
  it('keeps approved recommendation scenarios passing', () => {
    const matrix = buildPolicyMatrix();

    expect(matrix.every((entry) => entry.pass)).toBe(true);
  });

  it('includes the critical boundary and mixed-category cases for PO QA', () => {
    const ids = buildPolicyMatrix().map((entry) => entry.id);

    expect(ids).toEqual(
      expect.arrayContaining([
        'general_under_15_single',
        'general_over_25_multiple',
        'appliance_over_25_visit',
        'bedding_with_appliance_over_25_visit',
        'mixed_under_80_over_25_multiple',
        'length_74_under80_single',
        'length_75_around80_single',
        'length_85_around80_single',
        'length_86_large',
        'length_140_large',
        'length_141_large',
        'length_150_large',
        'length_151_visit',
        'bedding_unknown_weight_hard_hold_multiple',
      ]),
    );
  });

  it('shows trace metadata for reviewable recommendations', () => {
    const visit = buildPolicyMatrix().find((entry) => entry.id === 'appliance_over_25_visit');

    expect(visit?.trace).toMatchObject({
      recommendation: 'VISIT_PICKUP',
      matchedRuleId: 'weight-over-25',
      action: 'VISIT_PICKUP',
    });
  });

  it('keeps under 80cm heavy mixed items out of visit pickup', () => {
    const under80 = buildPolicyMatrix().find(
      (entry) => entry.id === 'mixed_under_80_over_25_multiple',
    );

    expect(under80?.trace).toMatchObject({
      recommendation: 'GENERAL_BAG_MULTIPLE',
      matchedRuleId: 'under-80-heavy',
      action: 'GENERAL_BAG_MULTIPLE',
    });
  });
});
