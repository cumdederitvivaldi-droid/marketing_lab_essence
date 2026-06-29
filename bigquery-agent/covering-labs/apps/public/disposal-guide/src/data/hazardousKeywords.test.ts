import { detectHazardous } from './hazardousKeywords';

describe('detectHazardous - service-handled false positives', () => {
  it.each([
    '수은등',
    '형광등',
    'LED등',
    '전구',
    '건전지',
    '보조배터리',
    '수은 들어간 전구',
    '수은전지',
    '단추형전지',
    '깨진 형광등',
  ])('does not block service-handled item: %s', (keyword) => {
    expect(detectHazardous(keyword)).toBeNull();
  });

  it.each([
    '수은',
    '수은체온계',
    '수은 온도계',
    '폐수은',
  ])('blocks hazardous mercury item: %s', (keyword) => {
    expect(detectHazardous(keyword)).toMatchObject({
      category: 'HAZARDOUS_WASTE',
    });
  });

  it('blocks mixed input when an explicit hazardous item is present with a service-handled item', () => {
    expect(detectHazardous('수은체온계와 전구')).toMatchObject({
      category: 'HAZARDOUS_WASTE',
      keyword: '수은체온계',
    });
  });

  it('blocks mixed input when a battery-like service-handled item appears with explicit hazardous mercury', () => {
    expect(detectHazardous('보조배터리와 수은체온계')).toMatchObject({
      category: 'HAZARDOUS_WASTE',
      keyword: '수은체온계',
    });
  });

  it('blocks mixed input when a service-handled item appears with another hazardous keyword', () => {
    expect(detectHazardous('전구와 폐페인트')).toMatchObject({
      category: 'HAZARDOUS_WASTE',
      keyword: '폐페인트',
    });
    expect(detectHazardous('보조배터리와 폐유')).toMatchObject({
      category: 'HAZARDOUS_WASTE',
      keyword: '폐유',
    });
    expect(detectHazardous('수은과 전구')).toMatchObject({
      category: 'HAZARDOUS_WASTE',
      keyword: '수은',
    });
  });
});
