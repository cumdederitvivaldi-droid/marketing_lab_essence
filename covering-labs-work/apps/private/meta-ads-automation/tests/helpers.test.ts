import { validateAdsetName } from '../lib/validation'

describe('validateAdsetName', () => {
  test('올바른 광고세트명은 null 반환', () => {
    expect(validateAdsetName('aos_purchase_lookalike_dcj_vd_이사워킹맘(대형폐기물)_sj1_26.03.04')).toBeNull()
    expect(validateAdsetName('ios_install_all_cr_im_컨셉(후킹)_mk1_26.05.22')).toBeNull()
  })

  test('컨셉 영역에 언더스코어가 포함되어도 유효', () => {
    expect(validateAdsetName('aos_purchase_all_cr_vd_이사_워킹맘_mk1_26.03.04')).toBeNull()
  })

  test('세그먼트가 부족하면 오류 반환', () => {
    expect(validateAdsetName('aos_purchase')).toContain('세그먼트')
  })

  test('잘못된 OS', () => {
    expect(validateAdsetName('win_purchase_all_cr_vd_컨셉_mk1_26.03.04')).toContain('[1]')
  })

  test('잘못된 세트목표', () => {
    expect(validateAdsetName('aos_click_all_cr_vd_컨셉_mk1_26.03.04')).toContain('[2]')
  })

  test('잘못된 세팅_타겟', () => {
    expect(validateAdsetName('aos_purchase_new_cr_vd_컨셉_mk1_26.03.04')).toContain('[3]')
  })

  test('잘못된 지역코드', () => {
    expect(validateAdsetName('aos_purchase_all_us_vd_컨셉_mk1_26.03.04')).toContain('[4]')
  })

  test('잘못된 콘텐츠_형식', () => {
    expect(validateAdsetName('aos_purchase_all_cr_gif_컨셉_mk1_26.03.04')).toContain('[5]')
  })

  test('잘못된 담당자+버전', () => {
    expect(validateAdsetName('aos_purchase_all_cr_vd_컨셉_MK1_26.03.04')).toContain('[7]')
  })

  test('잘못된 날짜 형식', () => {
    expect(validateAdsetName('aos_purchase_all_cr_vd_컨셉_mk1_2026.03.04')).toContain('[마지막]')
  })

  test('잘못된 날짜 값(월/일 범위)', () => {
    expect(validateAdsetName('aos_purchase_all_cr_vd_컨셉_mk1_26.13.01')).toContain('[마지막]')
    expect(validateAdsetName('aos_purchase_all_cr_vd_컨셉_mk1_26.00.01')).toContain('[마지막]')
    expect(validateAdsetName('aos_purchase_all_cr_vd_컨셉_mk1_26.01.32')).toContain('[마지막]')
    expect(validateAdsetName('aos_purchase_all_cr_vd_컨셉_mk1_26.01.00')).toContain('[마지막]')
  })

  test('윤년 경계값', () => {
    expect(validateAdsetName('aos_purchase_all_cr_vd_컨셉_mk1_24.02.29')).toBeNull()
    expect(validateAdsetName('aos_purchase_all_cr_vd_컨셉_mk1_25.02.29')).toContain('[마지막]')
  })
})
