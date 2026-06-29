/** @type {import('tailwindcss').Config} */
// Source of truth: Covering DESIGN.md (alpha)
// Figma library: 커버링 디자인 시스템

module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Brand (이전 alias 호환)
        primary: '#1AA3FF',
        'primary-strong': '#004880',
        'primary-tint': '#E5F4FF',
        'primary-default': '#008AE5',
        'primary-alternative': '#1AA3FF',

        // ── Text (Figma SementicToken/text)
        'text-strong': '#000000',
        'text-default': '#16191D',
        'text-neutral': '#434A56',
        'text-alternative': '#5C6575',
        'text-assistive': '#8A96A8',
        'text-inverse': '#FFFFFF',
        'text-on-dark': '#FFFFFF', // legacy alias of text-inverse
        'text-primary-strong': '#004880',
        'text-primary-default': '#008AE5',
        'text-primary-alternative': '#1AA3FF',

        // ── Icon (Figma SementicToken/icon — text 와 동일 팔레트)
        'icon-strong': '#000000',
        'icon-default': '#16191D',
        'icon-neutral': '#434A56',
        'icon-alternative': '#5C6575',
        'icon-assistive': '#8A96A8',
        'icon-inverse': '#FFFFFF',
        'icon-primary-strong': '#004880',
        'icon-primary-default': '#008AE5',
        'icon-primary-alternative': '#1AA3FF',

        // ── Background / Surface
        'background-default': '#FFFFFF',
        'background-dim': '#EEF2F6',
        'background-bright': '#FFFFFF',
        'surface-default': '#FFFFFF',
        'surface-dim': '#F8FAFB',
        'surface-dim2': '#EEF2F6',
        'surface-dim3': '#DEE3ED',
        'surface-inverse': '#000000',

        // ── Border (Figma SementicToken/border)
        'border-default': '#8A96A8',
        'border-strong': '#16191D',
        'border-tint': '#EEF2F6',
        'border-assistive': '#C0C7D8',
        'border-primary-default': '#1AA3FF',
        'border-primary-assistive': '#80CAFF',
        'border-secondary-default': '#18DC8A',
        'border-secondary-assistive': '#A5F3D2',
        'border-red-default': '#FF3358',
        'border-red-assistive': '#FF99AB',

        // ── Status
        'status-positive': '#07C576',
        'status-positive-tint': '#EDFCF6',
        'status-caution': '#FF9C1A',
        'status-caution-tint': '#FFF7E5',
        'status-negative': '#FF3358',
        'status-negative-tint': '#FFEBEE',
        'status-information': '#1AA3FF',
        'status-information-tint': '#E5F4FF',

        // ── Fill (Figma SementicToken/fill — 인터랙티브 배경)
        'fill-strong': '#000000',
        'fill-default': '#2D3139',
        'fill-neutral': '#434A56',
        'fill-alternative': '#5C6575',
        'fill-assistive': '#8A96A8',
        'fill-tint': '#EEF2F6',
        'fill-primary-strong': '#004880',
        'fill-primary-default': '#1AA3FF',
        'fill-primary-alternative': '#4DB5FF',
        'fill-primary-assistive': '#B2DFFF',
        'fill-primary-tint': '#E5F4FF',
        'fill-secondary-default': '#07C576',
        'fill-secondary-tint': '#EDFCF6',
        'fill-accent-red': '#FF3358',
        'fill-accent-red-tint': '#FFEBEE',
        'fill-inverse': '#FFFFFF',

        // ── Interaction (disable / inactive)
        'interaction-disable-strong': '#A3AEC2',
        'interaction-disable-normal': '#C0C7D8',
        'interaction-disable-alternative': '#DEE3ED',
        'interaction-disable-assistive': '#EEF2F6',
        'interaction-inactive-default': '#8A96A8',
        'interaction-inactive-alternative': '#C0C7D8',
        'interaction-inactive-assistive': '#DEE3ED',

        // ── Scrim (모달 backdrop)
        'scrim-default': '#16191D80',

        // ── Legacy (이전 컴포넌트 호환용 — 점진적으로 semantic 으로 마이그레이션)
        'text-secondary': '#9CA3AF',
        'text-tertiary': '#6B7280',
        'text-placeholder': '#C7CDD5',
        'border-subtle': '#E5E7EB',
        'border-faint': '#EFF2F6',
      },
      fontFamily: {
        sans: ['Pretendard', 'var(--font-sans)', '-apple-system', 'Apple SD Gothic Neo', 'sans-serif'],
      },
      fontSize: {
        // [size, { lineHeight, fontWeight, letterSpacing }]
        'display1':           ['57px', { lineHeight: '80px', fontWeight: '400' }],
        'display2':           ['45px', { lineHeight: '63px', fontWeight: '400' }],
        'display3':           ['36px', { lineHeight: '44px', fontWeight: '400' }],
        'headline1':          ['32px', { lineHeight: '44px', fontWeight: '600' }],
        'headline2':          ['28px', { lineHeight: '39px', fontWeight: '600' }],
        'headline3':          ['24px', { lineHeight: '34px', fontWeight: '600' }],
        'title1':             ['22px', { lineHeight: '30px', fontWeight: '700' }],
        'title2':             ['20px', { lineHeight: '28px', fontWeight: '700' }],
        'title3':             ['18px', { lineHeight: '26px', fontWeight: '400' }],
        'title3-emphasized':  ['18px', { lineHeight: '26px', fontWeight: '600' }],
        'body1-regular':      ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'body1-emphasized':   ['16px', { lineHeight: '24px', fontWeight: '600' }],
        'body2-regular':      ['14px', { lineHeight: '22px', fontWeight: '400' }],
        'body2-emphasized':   ['14px', { lineHeight: '22px', fontWeight: '600' }],
        'label1-regular':     ['12px', { lineHeight: '18px', fontWeight: '400' }],
        'label1-emphasized':  ['12px', { lineHeight: '18px', fontWeight: '600' }],
        'label2-emphasized':  ['11px', { lineHeight: '14px', fontWeight: '600', letterSpacing: '0.6px' }],
      },
      spacing: {
        '3xs': '2px',
        '2xs': '4px',
        '4xl': '48px',
        '5xl': '64px',
        'mobile-margin': '20px',
        'mobile-gutter': '8px',
        'tablet-margin': '40px',
        'tablet-gutter': '16px',
      },
      borderRadius: {
        'ds-sm': '8px',
        'ds-md': '12px',
        'ds-lg': '16px',
        'ds-full': '9999px',
      },
    },
  },
  plugins: [],
};
