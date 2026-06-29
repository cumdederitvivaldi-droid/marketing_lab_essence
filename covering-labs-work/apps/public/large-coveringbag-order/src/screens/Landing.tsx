
import { useState, useCallback, useEffect, useRef } from 'react';
import type { FormEvent, ChangeEvent } from 'react';
import type { FormData } from '../types';
import { checkRecentBagApplication, RECENT_APPLICATION_BLOCKED_CODE } from '../api/sheets';
import { BagImpossible, BagPossible1, BagPossible2 } from '../components/BagIllustrations';
import { ScaleIllustration } from '../components/ScaleIllustration';
import { getTrackingContext, track } from '../lib/analytics';
import { assetUrl } from '../lib/path';

type DaumPostcodeCompleteData = {
  roadAddress: string;
  zonecode: string;
};

type DaumPostcodeInstance = {
  embed: (element: HTMLElement) => void;
  open: () => void;
};

declare global {
  interface Window {
    daum?: {
      Postcode: new (options: {
        oncomplete: (data: DaumPostcodeCompleteData) => void;
        onresize?: (size: { height: number; width: number }) => void;
        width?: string;
        height?: string;
      }) => DaumPostcodeInstance;
    };
  }
}

const DAUM_POSTCODE_SCRIPT_SRC = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
let daumPostcodeScriptPromise: Promise<void> | null = null;

const ensureDaumPostcode = () => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('주소 검색 화면을 열 수 없어요.'));
  }

  if (window.daum?.Postcode) {
    return Promise.resolve();
  }

  if (daumPostcodeScriptPromise) {
    return daumPostcodeScriptPromise;
  }

  daumPostcodeScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = DAUM_POSTCODE_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      daumPostcodeScriptPromise = null;
      reject(new Error('주소 검색 스크립트를 불러오지 못했어요.'));
    };
    document.head.appendChild(script);
  });

  return daumPostcodeScriptPromise;
};

type TabId = 'detail' | 'notice' | 'apply';
type EntryMethodOption = '비밀번호' | '자유출입' | '기타사항';
type DeliveryRequestOption =
  | '부재 시 경비실에 맡겨주세요'
  | '배송 전에 꼭 연락주세요'
  | '집 앞에 놔주세요'
  | '택배함에 놔주세요'
  | '직접 입력';

interface LandingProps {
  onSubmit: (data: FormData) => Promise<void>;
}

const WarningIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0 mt-[2px]">
    <circle cx="8" cy="8" r="8" fill="#FF9800"/>
    <path d="M8 4V8.8" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="8" cy="11.4004" r="0.8" fill="white"/>
  </svg>
);

const ResponseInfoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
    <circle cx="8" cy="8" r="6.5" fill="#1AA3FF" />
    <path d="M8 4.6V8.4" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
    <circle cx="8" cy="10.9" r="0.8" fill="white" />
  </svg>
);

const ChevronDownIcon = ({ isOpen }: { isOpen: boolean }) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
  >
    <path d="M7 10L12 15L17 10" stroke="#434A56" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const DeliveryRequestRadio = ({ selected }: { selected: boolean }) => (
  <div className="flex items-center p-[4px]">
    <div className="relative h-[24px] w-[24px]">
      <div
        className={`absolute left-1/2 top-1/2 h-[20px] w-[20px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] ${
          selected ? 'border-[#1AA3FF]' : 'border-[#8A96A8]'
        }`}
      />
      {selected && (
        <div className="absolute left-1/2 top-1/2 h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1AA3FF]" />
      )}
    </div>
  </div>
);

const RecentBlockedBagGraphic = () => (
  <div className="flex items-center justify-center overflow-hidden rounded-[8px]">
    <div className="relative h-[80px] w-[80px] shrink-0 overflow-hidden">
      <img
        src={assetUrl('/assets/figma/bag-220l-icon.svg')}
        alt=""
        className="absolute left-1/2 top-1/2 block h-[74px] w-[63px] max-w-none shrink-0 -translate-x-1/2 -translate-y-1/2"
      />
    </div>
  </div>
);

const CtaLoadingIndicator = ({ label }: { label: string }) => (
  <span className="inline-flex items-center justify-center gap-[8px]" aria-live="polite">
    <span>{label}</span>
    <span className="inline-flex items-center gap-[4px]" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-[6px] w-[6px] rounded-full bg-white/90"
          style={{ animation: `cta-loading-dot 1s ease-in-out ${index * 0.14}s infinite` }}
        />
      ))}
    </span>
  </span>
);

const formatPhoneNumber = (phone: string) => {
  const digits = phone.replace(/\D/g, '');

  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return digits.startsWith('02')
      ? `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`
      : `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return phone;
};

const getConfirmValue = (value: string) => value.trim() || '-';

const formatConfirmAddress = (address: string, addressDetail: string) => {
  const cleanedAddress = address.trim().replace(/^\(\d{5}\)\s*/, '');
  return getConfirmValue([cleanedAddress, addressDetail.trim()].filter(Boolean).join(', '));
};

const normalizePhoneInput = (value: string) => value.replace(/\D/g, '').slice(0, 11);
const ENTRY_METHOD_OPTIONS: EntryMethodOption[] = ['비밀번호', '자유출입', '기타사항'];
const DELIVERY_REQUEST_OPTIONS: DeliveryRequestOption[] = [
  '부재 시 경비실에 맡겨주세요',
  '배송 전에 꼭 연락주세요',
  '집 앞에 놔주세요',
  '택배함에 놔주세요',
  '직접 입력',
];
const LARGE_BAG_FUNNEL_PROPS = {
  funnel_name: 'large_coveringbag_order',
  product_code: 'LARGE_COVERING_BAG',
  product_volume_l: 220,
  screen_name: 'ProductPurchaseScreen',
  legacy_app_route_event: '[ROUTE] 대형 커버링 봉투 (220L)',
};

const getErrorName = (err: unknown) => (err instanceof Error ? err.name : 'UnknownError');
const getErrorCode = (err: unknown) => {
  if (err && typeof err === 'object' && 'code' in err) {
    return String((err as { code?: unknown }).code ?? '');
  }

  return undefined;
};

export default function Landing({ onSubmit }: LandingProps) {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    phone: '',
    address: '',
    addressDetail: '',
    entryMethod: '',
    entryDetail: '',
    request: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('detail');
  const [fieldError, setFieldError] = useState<Partial<Record<string, string>>>({});
  const [showToast, setShowToast] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [showRecentBlockModal, setShowRecentBlockModal] = useState(false);
  const [showRequestSheet, setShowRequestSheet] = useState(false);
  const [showAddressSheet, setShowAddressSheet] = useState(false);
  const [isAddressSearchLoading, setIsAddressSearchLoading] = useState(false);
  const [addressSearchError, setAddressSearchError] = useState<string | null>(null);
  const [isCheckingRecentApplication, setIsCheckingRecentApplication] = useState(false);
  const [isApplyLocked, setIsApplyLocked] = useState(false);
  const [selectedRequestOption, setSelectedRequestOption] = useState<DeliveryRequestOption | ''>('');
  const [pendingRequestOption, setPendingRequestOption] = useState<DeliveryRequestOption | ''>('');

  const detailRef = useRef<HTMLElement>(null);
  const noticeRef = useRef<HTMLElement>(null);
  const applyRef = useRef<HTMLElement>(null);
  const addressSearchContainerRef = useRef<HTMLDivElement>(null);
  const addressDetailInputRef = useRef<HTMLInputElement>(null);
  const isFormDisabled = isApplyLocked;
  const isBottomCtaDisabled = isSubmitting || isCheckingRecentApplication || isApplyLocked;
  const baseInputClass = 'h-[50px] w-full rounded-[12px] border-[1px] px-[16px] text-[14px] outline-none placeholder:text-[#A0A5AB]';
  const showEntryMethodDetail = formData.entryMethod === '비밀번호' || formData.entryMethod === '기타사항';
  const showRequestDirectInput = selectedRequestOption === '직접 입력';
  const requestDropdownText = selectedRequestOption || '배송시 요청사항을 선택해주세요';
  const isRequestPlaceholder = !selectedRequestOption;

  const buildRequestTrackingProps = useCallback(() => ({
    ...LARGE_BAG_FUNNEL_PROPS,
    view_path: getTrackingContext().view_path,
    entry_method: formData.entryMethod || undefined,
    has_entry_detail: Boolean(formData.entryDetail.trim()),
    request_option: selectedRequestOption || undefined,
    is_request_direct_input: selectedRequestOption === '직접 입력',
    has_request: Boolean(formData.request.trim()),
  }), [formData.entryDetail, formData.entryMethod, formData.request, selectedRequestOption]);

  const getInputClassName = (fieldName?: keyof FormData) => {
    if (isFormDisabled) {
      return `${baseInputClass} cursor-not-allowed border-[#EEF2F6] bg-[#F5F7FA] text-[#A0A5AB]`;
    }

    const hasError = fieldName ? Boolean(fieldError[fieldName]) : false;
    return `${baseInputClass} text-[#16191D] focus:border-[#008AE5] ${hasError ? 'border-[#FF3358] bg-[#F8FAFB]' : 'border-[#EEF2F6] bg-white'}`;
  };

  useEffect(() => {
    if (!showToast) return;
    setToastVisible(true);
    const hideTimer = setTimeout(() => setToastVisible(false), 2000);
    return () => clearTimeout(hideTimer);
  }, [showToast]);

  useEffect(() => {
    if (toastVisible || !showToast) return;
    const removeTimer = setTimeout(() => setShowToast(false), 300);
    return () => clearTimeout(removeTimer);
  }, [toastVisible, showToast]);

  useEffect(() => {
    if (!showAddressSheet) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showAddressSheet]);

  useEffect(() => {
    const sections = [detailRef.current, noticeRef.current, applyRef.current];
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute('id');
            if (id) {
              setActiveTab(id as TabId);
            }
          }
        });
      },
      {
        rootMargin: '-40px 0px 0px 0px',
        threshold: 0.1,
      }
    );

    sections.forEach((section) => {
      if (section) observer.observe(section);
    });

    return () => {
      sections.forEach((section) => {
        if (section) observer.unobserve(section);
      });
    };
  }, []);

  useEffect(() => {
    if (!showAddressSheet) return;

    let isCancelled = false;
    const container = addressSearchContainerRef.current;

    if (!container) return;

    container.innerHTML = '';
    container.style.height = '100%';
    setAddressSearchError(null);
    setIsAddressSearchLoading(true);

    void ensureDaumPostcode()
      .then(() => {
        if (isCancelled || !window.daum?.Postcode) {
          throw new Error('주소 검색 화면을 열 수 없어요.');
        }

        const postcode = new window.daum.Postcode({
          oncomplete: (data: DaumPostcodeCompleteData) => {
            if (isCancelled) return;

            setFormData((prev) => ({ ...prev, address: `(${data.zonecode}) ${data.roadAddress}` }));
            setFieldError((prev) => {
              const copy = { ...prev };
              delete copy.address;
              return copy;
            });
            setAddressSearchError(null);
            setShowAddressSheet(false);
            requestAnimationFrame(() => addressDetailInputRef.current?.focus());
          },
          onresize: (size) => {
            if (isCancelled) return;
            container.style.height = `${Math.max(size.height, 420)}px`;
          },
          width: '100%',
          height: '100%',
        });

        postcode.embed(container);
      })
      .catch(() => {
        if (isCancelled) return;
        setShowAddressSheet(false);
        setAddressSearchError('주소 검색 화면을 열지 못했어요. 다시 눌러주세요.');
      })
      .finally(() => {
        if (!isCancelled) {
          setIsAddressSearchLoading(false);
        }
      });

    return () => {
      isCancelled = true;

      container.innerHTML = '';
      container.style.height = '100%';
    };
  }, [showAddressSheet]);

  useEffect(() => {
    track('[ROUTE] ProductPurchaseScreen', {
      ...LARGE_BAG_FUNNEL_PROPS,
      funnel_step: 'landing_view',
      view_path: getTrackingContext().view_path,
    });
  }, []);

  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    if (isFormDisabled) return;
    const { name, value } = e.target;
    let nextValue = value;

    if (name === 'phone') {
      nextValue = normalizePhoneInput(value);
    } else if (name === 'request') {
      nextValue = value.slice(0, 30);
    }

    setFormData(prev => ({ ...prev, [name]: nextValue }));
    setFieldError(prev => { const copy = { ...prev }; delete copy[name]; return copy; });
  }, [isFormDisabled]);

  const handleEntryMethodSelect = useCallback((option: EntryMethodOption) => {
    if (isFormDisabled) return;

    track('[CLICK] ProductPurchaseScreen_editAccessInfo', {
      ...LARGE_BAG_FUNNEL_PROPS,
      funnel_step: 'edit_access_info',
      accessInfo: option,
      view_path: getTrackingContext().view_path,
    });

    setFormData(prev => ({
      ...prev,
      entryMethod: option,
      entryDetail: prev.entryMethod === option ? prev.entryDetail : '',
    }));
    setFieldError(prev => {
      const copy = { ...prev };
      delete copy.entryMethod;
      return copy;
    });
  }, [isFormDisabled]);

  const handleRequestFieldClick = useCallback(() => {
    if (isFormDisabled) return;

    track('[CLICK] ProductPurchaseScreen_editComment', {
      ...buildRequestTrackingProps(),
      funnel_step: 'edit_comment',
    });

    setPendingRequestOption(selectedRequestOption);
    setShowRequestSheet(true);
  }, [buildRequestTrackingProps, isFormDisabled, selectedRequestOption]);

  const handleRequestOptionApply = useCallback(() => {
    if (!pendingRequestOption) return;

    setSelectedRequestOption(pendingRequestOption);
    setFormData(prev => ({
      ...prev,
      request:
        pendingRequestOption === '직접 입력'
          ? selectedRequestOption === '직접 입력'
            ? prev.request
            : ''
          : pendingRequestOption,
    }));
    setShowRequestSheet(false);
  }, [pendingRequestOption, selectedRequestOption]);

  const validate = (): Partial<Record<string, string>> => {
    const errors: Partial<Record<string, string>> = {};
    if (!formData.name.trim()) errors.name = '받는 분 성함을 입력해주세요.';
    if (!formData.phone.trim()) errors.phone = '전화번호를 입력해주세요.';
    else if (!/^\d{10,11}$/.test(formData.phone)) errors.phone = '정확한 휴대폰 번호를 입력해주세요.';
    if (!formData.address.trim()) errors.address = '주소를 입력해주세요.';
    if (!formData.addressDetail.trim()) errors.addressDetail = '상세주소를 입력해주세요.';
    if (!formData.entryMethod.trim()) errors.entryMethod = '출입방법을 선택해주세요.';
    return errors;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
  };

  const handleAddressClick = () => {
    if (isFormDisabled) return;

    setAddressSearchError(null);
    setShowAddressSheet(true);
  };

  const handleCtaClick = async () => {
    setError(null);

    const validationResult = validate();
    if (Object.keys(validationResult).length > 0) {
      setActiveTab('apply');
      setFieldError(validationResult);
      applyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    setIsCheckingRecentApplication(true);

    try {
      const isBlocked = await checkRecentBagApplication(formData.phone);

      if (isBlocked) {
        track('[EVENT] ProductPurchaseResult', {
          ...buildRequestTrackingProps(),
          funnel_step: 'submit_blocked',
          is_success: false,
          result_type: 'recent_application_blocked',
          error_code: RECENT_APPLICATION_BLOCKED_CODE,
          product_totalQuantity: 1,
          accessInfo: formData.entryMethod,
          comment: selectedRequestOption || undefined,
        });
        setIsApplyLocked(true);
        setShowRecentBlockModal(true);
        setShowConfirm(false);
        return;
      }

      setShowConfirm(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '신청 가능 여부를 확인할 수 없습니다.');
      applyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } finally {
      setIsCheckingRecentApplication(false);
    }
  };

  const handleConfirmSubmit = async () => {
    setIsSubmitting(true);

    try {
      await onSubmit(formData);
      track('[EVENT] ProductPurchaseResult', {
        ...buildRequestTrackingProps(),
        funnel_step: 'submit_success',
        is_success: true,
        result_type: 'submitted',
        product_totalQuantity: 1,
        accessInfo: formData.entryMethod,
        comment: selectedRequestOption || undefined,
      });
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === RECENT_APPLICATION_BLOCKED_CODE) {
        track('[EVENT] ProductPurchaseResult', {
          ...buildRequestTrackingProps(),
          funnel_step: 'submit_blocked',
          is_success: false,
          result_type: 'recent_application_blocked',
          error_code: getErrorCode(err),
          error_message: err.message,
          product_totalQuantity: 1,
          accessInfo: formData.entryMethod,
          comment: selectedRequestOption || undefined,
        });
        setShowConfirm(false);
        setIsApplyLocked(true);
        setShowRecentBlockModal(true);
        setError(null);
        return;
      }

      track('[EVENT] ProductPurchaseResult', {
        ...buildRequestTrackingProps(),
        funnel_step: 'submit_error',
        is_success: false,
        result_type: 'error',
        error_name: getErrorName(err),
        error_code: getErrorCode(err),
        error_message: err instanceof Error ? err.message : 'Unknown error',
        product_totalQuantity: 1,
        accessInfo: formData.entryMethod,
        comment: selectedRequestOption || undefined,
      });
      setShowConfirm(false);
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
      applyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmCancel = () => {
    setShowConfirm(false);
  };

  const tabs: { id: TabId; label: string; ref: React.RefObject<HTMLElement | null> }[] = [
    { id: 'detail', label: '상세 정보', ref: detailRef },
    { id: 'notice', label: '유의사항', ref: noticeRef },
    { id: 'apply', label: '신청하기', ref: applyRef },
  ];

  const confirmRows = [
    { label: '받는분 성함', value: getConfirmValue(formData.name) },
    { label: '전화번호', value: formatPhoneNumber(getConfirmValue(formData.phone)), accent: true },
    { label: '주소', value: formatConfirmAddress(formData.address, formData.addressDetail), multiline: true },
    { label: '출입방법', value: getConfirmValue(formData.entryMethod) },
    ...(showEntryMethodDetail && formData.entryDetail.trim()
      ? [{ label: '상세내용', value: formData.entryDetail.trim(), multiline: true }]
      : []),
    { label: '요청사항', value: getConfirmValue(formData.request), multiline: Boolean(formData.request.trim()) },
  ];

  return (
    <div className="bg-white">
      <main>
        {/* 탭바 */}
        <div className="fixed top-0 left-[50%] z-40 w-full max-w-[360px] -translate-x-[50%] bg-white border-b border-[#eef2f6] pt-[env(safe-area-inset-top)]">
          <div className="relative flex">
            {tabs.map(({ id, label, ref }) => (
              <button
                key={id}
                type="button"
                onClick={() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className={`flex flex-1 h-[40px] items-center justify-center p-[8px] font-semibold text-[18px] leading-[26px] transition-colors duration-200 ${activeTab === id ? 'text-[#16191d]' : 'text-[#8a96a8]'}`}
              >
                {label}
              </button>
            ))}
            <div
              className="absolute bottom-0 h-[2px] bg-[#16191d] transition-transform duration-300"
              style={{
                width: `${100 / tabs.length}%`,
                transform: `translateX(${tabs.findIndex(t => t.id === activeTab) * 100}%)`,
              }}
            />
          </div>
        </div>

        {/* 탭바 높이 스페이서 */}
        <div className="h-[calc(40px_+_env(safe-area-inset-top))]"></div>

        {/* 상세 정보 탭 */}
        <section ref={detailRef} id="detail" className="px-[20px] pt-[20px] pb-[32px]">
          <div className="mb-[20px] flex items-center justify-center gap-[10px] rounded-[8px] bg-[#E5F4FF] px-[16px] py-[12px]">
            <ResponseInfoIcon />
            <p className="flex-1 text-[14px] leading-[22px] text-[#16191D]">
              대형 커버링 봉투는 <span className="font-bold">마지막 신청일 기준 7일</span>이 지나야 다시 신청할 수 있어요. 참고해 주세요
            </p>
          </div>
          {/* 타이틀 */}
          <div className="mb-[32px] text-center">
            <div className="flex justify-center gap-[8px]">
              <span className="rounded-[4px] bg-[#E5F4FF] px-[8px] py-[2px] text-[12px] font-semibold text-[#008AE5]">소형 가구</span>
              <span className="rounded-[4px] bg-[#E5F4FF] px-[8px] py-[2px] text-[12px] font-semibold text-[#008AE5]">소형 가전</span>
              <span className="rounded-[4px] bg-[#E5F4FF] px-[8px] py-[2px] text-[12px] font-semibold text-[#008AE5]">이불</span>
            </div>
            <p className="mt-[4px] text-[14px] text-[#73787E]">부피 큰 생활 폐기물도 간편하게 배출하는</p>
            <h2 className="mt-[4px] text-[28px] font-bold text-[#16191D]">대형 커버링 봉투</h2>
          </div>
          {/* 봉투차이 + 크기예시 일러스트 (피그마 node 29:2199) */}
          <div className="flex flex-col gap-[12px] items-center relative mb-[32px]">
            {/* 봉투차이 이미지 */}
            <div className="h-[162px] relative shrink-0 w-[300px]">
              <div className="absolute contents left-[162.85px] top-px">
                <div className="absolute h-[147.717px] left-[162.85px] top-px w-[98.501px]">
                  <img alt="" className="absolute block max-w-none size-full" src={assetUrl('/assets/figma/bag-220l-compare.svg')} />
                </div>
                <div className="absolute contents left-[263.31px] top-[24.87px]">
                  <p className="-translate-x-1/2 absolute font-semibold leading-[12.6px] left-[278.31px] text-[9.9px] text-[#434a56] text-center top-[75.31px] tracking-[0.0594px] whitespace-nowrap">
                    141cm
                  </p>
                  <div className="absolute h-[44.132px] left-[263.61px] top-[24.87px] w-[3.61px]">
                    <div className="absolute inset-[-0.67%_-8.22%_0_0]">
                      <img alt="" className="block max-w-none size-full" src={assetUrl('/assets/figma/vector4.svg')} />
                    </div>
                  </div>
                  <div className="absolute flex h-[53.856px] items-center justify-center left-[263.61px] top-[94.86px] w-[3.61px]">
                    <div className="-scale-y-100 flex-none">
                      <div className="h-[53.856px] relative w-[3.61px]">
                        <div className="absolute inset-[-0.55%_-8.22%_0_0]">
                          <img alt="" className="block max-w-none size-full" src={assetUrl('/assets/figma/vector5.svg')} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute contents left-[162.85px] top-[149.68px]">
                  <p className="-translate-x-1/2 absolute font-semibold leading-[12.6px] left-[212.97px] text-[9.9px] text-[#434a56] text-center top-[149.68px] tracking-[0.0594px] whitespace-nowrap">
                    110cm
                  </p>
                  <div className="absolute flex h-[3.61px] items-center justify-center left-[229.42px] top-[153.86px] w-[31.934px]">
                    <div className="flex-none rotate-90">
                      <div className="h-[31.934px] relative w-[3.61px]">
                        <div className="absolute inset-[-0.93%_-8.22%_0_0]">
                          <img alt="" className="block max-w-none size-full" src={assetUrl('/assets/figma/vector6.svg')} />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="absolute flex h-[3.61px] items-center justify-center left-[162.85px] top-[153.86px] w-[31.934px]">
                    <div className="-scale-y-100 flex-none rotate-90">
                      <div className="h-[31.934px] relative w-[3.61px]">
                        <div className="absolute inset-[-0.93%_-8.22%_0_0]">
                          <img alt="" className="block max-w-none size-full" src={assetUrl('/assets/figma/vector7.svg')} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute contents left-[17.7px] top-[28.69px]">
                <div className="absolute h-[104.298px] left-[17.7px] top-[28.69px] w-[69.548px]">
                  <img alt="" className="absolute block max-w-none size-full" src={assetUrl('/assets/figma/bag-80l-compare.svg')} />
                </div>
                <div className="absolute contents left-[88.36px] top-[45.54px]">
                  <p className="-translate-x-1/2 absolute font-medium leading-[7.031px] left-[97.86px] text-[7.2px] text-[#434a56] text-center top-[81.16px] whitespace-nowrap">
                    70cm
                  </p>
                  <div className="absolute h-[31.16px] left-[88.84px] top-[45.54px] w-[2.549px]">
                    <div className="absolute inset-[-0.67%_-8.22%_0_0]">
                      <img alt="" className="block max-w-none size-full" src={assetUrl('/assets/figma/vector8.svg')} />
                    </div>
                  </div>
                  <div className="absolute flex h-[38.026px] items-center justify-center left-[88.84px] top-[94.96px] w-[2.549px]">
                    <div className="-scale-y-100 flex-none">
                      <div className="h-[38.026px] relative w-[2.549px]">
                        <div className="absolute inset-[-0.55%_-8.22%_0_0]">
                          <img alt="" className="block max-w-none size-full" src={assetUrl('/assets/figma/vector9.svg')} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute contents left-[17.7px] top-[133.67px]">
                  <p className="-translate-x-1/2 absolute font-semibold leading-[0] left-[52.1px] text-[0px] text-[#434a56] text-center top-[133.67px] whitespace-nowrap">
                    <span className="font-medium leading-[8.594px] text-[7.2px]">60</span>
                    <span className="font-medium leading-[7.031px] text-[7.2px]">cm</span>
                  </p>
                  <div className="absolute flex h-[2.549px] items-center justify-center left-[64.7px] top-[136.62px] w-[22.548px]">
                    <div className="flex-none rotate-90">
                      <div className="h-[22.548px] relative w-[2.549px]">
                        <div className="absolute inset-[-0.93%_-8.22%_0_0]">
                          <img alt="" className="block max-w-none size-full" src={assetUrl('/assets/figma/vector10.svg')} />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="absolute flex h-[2.549px] items-center justify-center left-[17.7px] top-[136.62px] w-[22.548px]">
                    <div className="-scale-y-100 flex-none rotate-90">
                      <div className="h-[22.548px] relative w-[2.549px]">
                        <div className="absolute inset-[-0.93%_-8.22%_0_0]">
                          <img alt="" className="block max-w-none size-full" src={assetUrl('/assets/figma/vector11.svg')} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute h-[24.3px] left-[90.6px] top-[2.25px] w-[62.1px]">
                <div className="absolute inset-[-2.78%_-1.09%]">
                  <img alt="" className="block max-w-none size-full" src={assetUrl('/assets/figma/bracket-top.svg')} />
                </div>
              </div>
              <div className="absolute flex h-[24.3px] items-center justify-center left-[90.6px] top-[135.9px] w-[62.1px]">
                <div className="-scale-y-100 flex-none rotate-180">
                  <div className="h-[24.3px] relative w-[62.1px]">
                    <div className="absolute inset-[-2.78%_-1.09%]">
                      <img alt="" className="block max-w-none size-full" src={assetUrl('/assets/figma/bracket-bottom.svg')} />
                    </div>
                  </div>
                </div>
              </div>
              <p className="-translate-x-1/2 absolute bg-white px-[6px] font-semibold leading-[30.6px] left-[127.8px] text-[21.6px] text-[#008ae5] text-center top-[64.8px] whitespace-nowrap">
                3배
              </p>
              <div className="-translate-x-1/2 absolute font-semibold leading-[0] left-[51.5px] text-[8px] text-white text-center top-[77px] tracking-[0.048px] whitespace-nowrap">
                <p className="leading-[14px] mb-0">일반 커버링 봉투</p>
                <p className="leading-[14px]">(80L)</p>
              </div>
              <div className="-translate-x-1/2 absolute font-semibold leading-[0] left-[212.5px] text-[11px] text-white text-center top-[67px] tracking-[0.066px] whitespace-nowrap">
                <p className="leading-[14px] mb-0">대형 커버링 봉투</p>
                <p className="leading-[14px]">(220L)</p>
              </div>
            </div>
            {/* 크기예시 카드 */}
            <div className="bg-[#f8fafb] flex flex-col gap-[8px] items-center justify-center px-[16px] py-[12px] relative rounded-[16px] w-full">
              <div className="h-[126px] relative shrink-0 w-full">
                <div className="absolute flex gap-[24px] items-center leading-[0] left-[37.89px] top-[3px]">
                  <div className="grid-cols-[max-content] grid-rows-[max-content] inline-grid place-items-start relative shrink-0">
                    <div className="col-start-1 row-start-1 h-[93.53px] ml-0 mt-[1.14px] overflow-clip relative w-[62.953px]">
                      <div className="absolute inset-0">
                        <div className="absolute inset-[0_15.96%_48.16%_15.8%]">
                          <img alt="" className="absolute block max-w-none size-full" src={assetUrl('/assets/figma/chair-top.svg')} />
                        </div>
                        <div className="absolute inset-[40.49%_0_0_0]">
                          <img alt="" className="absolute block max-w-none size-full" src={assetUrl('/assets/figma/chair-bottom.svg')} />
                        </div>
                      </div>
                    </div>
                    <p className="col-start-1 row-start-1 font-semibold leading-[3.852px] ml-[66.74px] mt-[40.85px] relative text-[7.166px] text-[#434a56] text-center whitespace-nowrap">
                      120cm
                    </p>
                    <div className="col-start-1 row-start-1 h-[34.896px] ml-[73.65px] mt-0 relative w-[1.396px]">
                      <div className="absolute inset-[-0.33%_-8.22%_0_0]">
                        <img alt="" className="block max-w-none size-full" src={assetUrl('/assets/figma/vector14.svg')} />
                      </div>
                    </div>
                    <div className="col-start-1 row-start-1 flex h-[44.756px] items-center justify-center ml-[73.65px] mt-[52.11px] relative w-[1.396px]">
                      <div className="-scale-y-100 flex-none">
                        <div className="h-[44.756px] relative w-[1.396px]">
                          <div className="absolute inset-[-0.26%_-8.22%_0_0]">
                            <img alt="" className="block max-w-none size-full" src={assetUrl('/assets/figma/vector15.svg')} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="grid-cols-[max-content] grid-rows-[max-content] inline-grid place-items-start relative shrink-0">
                    <div className="col-start-1 row-start-1 h-[112.073px] ml-0 mt-0 relative w-[74.732px]">
                      <img alt="" className="absolute block max-w-none size-full" src={assetUrl('/assets/figma/bag-220l-example.svg')} />
                    </div>
                    <div className="col-start-1 row-start-1 grid-cols-[max-content] grid-rows-[max-content] inline-grid ml-[76.49px] mt-[18.11px] place-items-start relative">
                      <p className="col-start-1 row-start-1 font-semibold ml-0 mt-[38.27px] relative text-[0px] text-[#434a56] text-center whitespace-nowrap">
                        <span className="leading-[9.234px] text-[7.166px]">141</span>
                        <span className="leading-[7.555px] text-[7.166px]">cm</span>
                      </p>
                      <div className="col-start-1 row-start-1 h-[33.483px] ml-[1.75px] mt-0 relative w-[2.739px]">
                        <div className="absolute inset-[-0.67%_-8.22%_0_0]">
                          <img alt="" className="block max-w-none size-full" src={assetUrl('/assets/figma/vector16.svg')} />
                        </div>
                      </div>
                      <div className="col-start-1 row-start-1 flex h-[40.861px] items-center justify-center ml-[1.75px] mt-[53.11px] relative w-[2.739px]">
                        <div className="-scale-y-100 flex-none">
                          <div className="h-[40.861px] relative w-[2.739px]">
                            <div className="absolute inset-[-0.55%_-8.22%_0_0]">
                              <img alt="" className="block max-w-none size-full" src={assetUrl('/assets/figma/vector17.svg')} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="col-start-1 row-start-1 grid-cols-[max-content] grid-rows-[max-content] inline-grid ml-0 mt-[112.81px] place-items-start relative">
                      <p className="col-start-1 row-start-1 font-semibold ml-[26.48px] mt-0 relative text-[0px] text-[#434a56] text-center whitespace-nowrap">
                        <span className="leading-[9.234px] text-[7.166px]">110</span>
                        <span className="leading-[7.555px] text-[7.166px]">cm</span>
                      </p>
                      <div className="col-start-1 row-start-1 flex h-[2.739px] items-center justify-center ml-[50.5px] mt-[3.17px] relative w-[24.229px]">
                        <div className="flex-none rotate-90">
                          <div className="h-[24.229px] relative w-[2.739px]">
                            <div className="absolute inset-[-0.93%_-8.22%_0_0]">
                              <img alt="" className="block max-w-none size-full" src={assetUrl('/assets/figma/vector18.svg')} />
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="col-start-1 row-start-1 flex h-[2.739px] items-center justify-center ml-0 mt-[3.17px] relative w-[24.229px]">
                        <div className="-scale-y-100 flex-none rotate-90">
                          <div className="h-[24.229px] relative w-[2.739px]">
                            <div className="absolute inset-[-0.93%_-8.22%_0_0]">
                              <img alt="" className="block max-w-none size-full" src={assetUrl('/assets/figma/vector19.svg')} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="col-start-1 row-start-1 grid-cols-[max-content] grid-rows-[max-content] inline-grid ml-[12.11px] mt-[38.52px] place-items-start relative">
                      <div className="col-start-1 row-start-1 h-[24.229px] ml-0 mt-0 relative w-[50.504px]">
                        <img alt="" className="absolute block max-w-none size-full" src={assetUrl('/assets/figma/group2.svg')} />
                      </div>
                      <div className="col-start-1 row-start-1 grid-cols-[max-content] grid-rows-[max-content] inline-grid ml-[0.43px] mt-[27.45px] place-items-start relative">
                        <div className="col-start-1 row-start-1 h-[8.622px] ml-0 mt-[0.87px] relative w-[35.352px]">
                          <img alt="" className="absolute block max-w-none size-full" src={assetUrl('/assets/figma/group3.svg')} />
                        </div>
                        <div className="col-start-1 row-start-1 inline-grid ml-[12.88px] mt-0 place-items-start relative">
                          <div
                            className="col-start-1 row-start-1 h-[5.231px] ml-0 mt-0 relative w-[5.249px]"
                            style={{
                              maskImage: `url(${assetUrl('/assets/figma/mask-clip.svg')})`,
                              maskRepeat: 'no-repeat',
                              maskPosition: '0px 0px',
                              maskSize: '5.222px 5.205px',
                            }}
                          >
                            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                              <img alt="" className="absolute left-0 max-w-none size-full top-0" src={assetUrl('/assets/figma/rect1.png')} />
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="col-start-1 row-start-1 h-[4.44px] ml-[34.74px] mt-[48.25px] relative w-[15.228px]">
                        <img alt="" className="absolute block max-w-none size-full" src={assetUrl('/assets/figma/group4.svg')} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <p className="font-semibold leading-[14px] relative shrink-0 text-[11px] text-[#f20d36] text-center tracking-[0.066px] whitespace-nowrap">
                ※실제 대형 봉투 사이즈 예시
              </p>
            </div>
          </div>
          <h3 className="text-[16px] font-bold text-[#16191D]">어떤 봉투를 사야할지 헷갈린다면?</h3>
          <p className="mt-[8px] text-[14px] leading-[22px] text-[#73787E]">
            일반 봉투는 소형 폐기물용<br/>
            대형 봉투는 일반 봉투에 담기지 않는 큰 물건용
          </p>
          <div className="mt-[24px] flex gap-[8px]">
            {/* 80L 카드 */}
            <div className="flex-[1_0_0] rounded-[16px] bg-white overflow-hidden shadow-[0px_2px_8px_0px_rgba(0,0,0,0.08)]">
              <div className="bg-[#eef2f6] flex flex-col gap-[2px] items-center justify-center px-[16px] py-[12px]">
                <div className="relative size-[48px] overflow-clip">
                  <div className="absolute inset-[3.75%_10.45%]">
                    <img src={assetUrl('/assets/figma/bag-80l-icon.svg')} alt="80L 봉투" className="absolute block max-w-none size-full" />
                  </div>
                </div>
                <p className="text-[12px] font-semibold text-[#434a56] text-center">일반 커버링 봉투 (80L)</p>
              </div>
              <div className="flex flex-col items-center">
                <div className="flex h-[52px] w-full items-center justify-center border-b border-[#EEF2F6] px-[8px]">
                  <p className="text-[12px] text-[#434a56] text-center"><span className="font-bold">소형</span> 생활 폐기물</p>
                </div>
                <div className="flex w-full items-center justify-center border-b border-[#EEF2F6] px-[8px] py-[8px]">
                  <p className="text-[12px] text-[#434a56] text-center">봉투에 담아<br/>묶을 수 있는 크기</p>
                </div>
                <div className="flex w-full items-center justify-center px-[8px] py-[8px]">
                  <p className="text-[12px] text-[#434a56] text-center"><span className="font-bold">일상적으로 자주</span><br/><span className="font-bold">버리는 쓰레기</span></p>
                </div>
              </div>
            </div>
            {/* 220L 카드 */}
            <div className="flex-[1_0_0] rounded-[16px] bg-white overflow-hidden shadow-[0px_2px_8px_0px_rgba(0,0,0,0.08)]">
              <div className="bg-[#e5f4ff] flex flex-col gap-[2px] items-center justify-center px-[16px] py-[12px]">
                <div className="relative size-[48px] overflow-clip">
                  <div className="absolute inset-[3.75%_10.45%]">
                    <img src={assetUrl('/assets/figma/bag-220l-icon.svg')} alt="220L 봉투" className="absolute block max-w-none size-full" />
                  </div>
                </div>
                <p className="text-[12px] font-semibold text-[#434a56] text-center">대형 커버링 봉투 (220L)</p>
              </div>
              <div className="flex flex-col items-center">
                <div className="flex h-[52px] w-full items-center justify-center border-b border-[#EEF2F6] px-[8px]">
                  <p className="text-[12px] text-[#434a56] text-center"><span className="font-bold">부피가 큰</span> 생활 폐기물</p>
                </div>
                <div className="flex w-full items-center justify-center border-b border-[#EEF2F6] px-[8px] py-[8px]">
                  <p className="text-[12px] font-semibold text-[#434a56] text-center">일반 봉투에<br/>담기 어려운 크기</p>
                </div>
                <div className="flex w-full items-center justify-center px-[8px] py-[8px]">
                  <p className="text-[12px] text-[#434a56] text-center"><span className="font-bold">이사, 대청소</span><br/><span className="font-bold">계절 정리 때 많이 사용</span></p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 유의사항 탭 */}
        <div className="h-[8px] bg-[#EEF2F6]"></div>
        <section ref={noticeRef} id="notice" className="px-[20px] py-[32px]">
          <h3 className="text-[16px] font-bold text-[#16191D]">아래 유의사항을 꼭 지켜주세요</h3>
          <p className="mt-[4px] text-[14px] text-[#FF3358]">지키지 않을 경우 수거할 수 없어요</p>

          <div className="mt-[24px]">
            <h4 className="text-center text-[16px] font-semibold text-[#16191D]">봉투에 담아서 손잡이 꼭 묶기</h4>
            <p className="mt-[4px] text-center text-[14px] leading-[22px] text-[#5c6575]">
              대형 폐기물의 경우 반절 이상 담겨야 하고
              <br />
              손잡이를 묶어주세요!
            </p>
            <div className="mt-[12px] rounded-[16px] bg-[#f8fafb] py-[12px]">
              <div className="flex justify-center gap-[16px]">
                <div className="flex flex-col items-center">
                  <BagImpossible />
                </div>
                <div className="flex flex-col items-center">
                  <BagPossible1 />
                </div>
                <div className="flex flex-col items-center">
                  <BagPossible2 />
                </div>
              </div>
            </div>
            <div className="mt-[12px] flex flex-col gap-[2px]">
              <div className="flex items-center gap-[4px] px-[16px] py-[8px]">
                <WarningIcon />
                <p className="text-[12px] text-[#5c6575]">길이가 긴 물건도 봉투에 들어가면 수거할 수 있어요</p>
              </div>
              <div className="flex items-center gap-[4px] px-[16px] py-[8px]">
                <WarningIcon />
                <p className="text-[12px] text-[#5c6575]">물건이 봉투에 반절 이상 담겨야 해요</p>
              </div>
            </div>
          </div>

          <div className="mt-[24px]">
            <ScaleIllustration />
          </div>
        </section>

        {/* 섹션 4: 유의사항 리스트 */}
        <div className="h-[8px] bg-[#EEF2F6]"></div>
        <section className="px-[20px] py-[32px]">
          <h3 className="text-[14px] font-semibold text-[#16191D]">유의사항</h3>
          <div className="mt-[8px] rounded-[12px] bg-[#F5F7FA] p-[16px]">
            <ul className="flex flex-col gap-[8px]">
              <li className="flex items-start gap-[8px]">
                <div className="mt-[7px] h-[4px] w-[4px] shrink-0 rounded-full bg-[#73787E]"></div>
                <p className="text-[13px] leading-[18px] text-[#434A56]">봉투에 담아서 손잡이를 꼭 묶어주세요. 대형 폐기물의 경우 반절 이상 담겨야 수거 가능합니다.</p>
              </li>
              <li className="flex items-start gap-[8px]">
                <div className="mt-[7px] h-[4px] w-[4px] shrink-0 rounded-full bg-[#73787E]"></div>
                <p className="text-[13px] leading-[18px] text-[#434A56]">한 봉투당 25kg 미만으로 담아주세요. 초과 시 봉투가 찢어질 수 있습니다.</p>
              </li>
              <li className="flex items-start gap-[8px]">
                <div className="mt-[7px] h-[4px] w-[4px] shrink-0 rounded-full bg-[#73787E]"></div>
                <p className="text-[13px] leading-[18px] text-[#434A56]">음식물은 일반 커버링 봉투로 담아주세요. 대형 폐기물의 자원 재활용을 위해 분리해주세요.</p>
              </li>
              <li className="flex items-start gap-[8px]">
                <div className="mt-[7px] h-[4px] w-[4px] shrink-0 rounded-full bg-[#73787E]"></div>
                <p className="text-[13px] leading-[18px] text-[#434A56]">대형 봉투는 시범 운행 중(BETA)이라 제공되는 실제 디자인이 이미지와 다를 수 있습니다.</p>
              </li>
            </ul>
          </div>
        </section>

        {/* 신청하기 탭 */}
        <div className="h-[8px] bg-[#EEF2F6]"></div>
        <section ref={applyRef} id="apply" className="px-[20px] py-[32px]">
          <h3 className="text-[16px] font-bold text-[#16191D]">배송 정보를 작성해주세요</h3>
          <form id="delivery-form" onSubmit={handleSubmit} className="mt-[24px] flex flex-col gap-[16px]">
            <div>
              <label htmlFor="name" className="mb-[8px] block text-[14px] font-semibold text-[#16191D]">
                받는 분 성함 <span className="text-[#FF3358]">*</span>
              </label>
              <input type="text" id="name" name="name" value={formData.name} onChange={handleInputChange} placeholder="홍길동" disabled={isFormDisabled} className={getInputClassName('name')} />
              {fieldError['name'] && (
                <p className="mt-[4px] px-[8px] text-[14px] leading-[22px] text-[#FF3358]">{fieldError['name']}</p>
              )}
            </div>
            <div>
              <label htmlFor="phone" className="mb-[8px] block text-[14px] font-semibold text-[#16191D]">
                전화번호 <span className="text-[#FF3358]">*</span>
              </label>
              <input type="tel" id="phone" name="phone" value={formData.phone} onChange={handleInputChange} placeholder="01012345678" inputMode="numeric" disabled={isFormDisabled} className={getInputClassName('phone')} />
              {fieldError['phone'] && (
                <p className="mt-[4px] px-[8px] text-[14px] leading-[22px] text-[#FF3358]">{fieldError['phone']}</p>
              )}
            </div>
            <div>
              <label htmlFor="address" className="mb-[8px] block text-[14px] font-semibold text-[#16191D]">
                주소 입력 <span className="text-[12px] text-[#73787E]">(서비스 지역 내만 가능)</span> <span className="text-[#FF3358]">*</span>
              </label>
              <button
                type="button"
                id="address"
                name="address"
                disabled={isFormDisabled}
                onClick={handleAddressClick}
                aria-haspopup="dialog"
                className={`${getInputClassName('address')} flex items-center text-left ${isFormDisabled ? '' : 'cursor-pointer'}`}
              >
                <span className={formData.address ? 'text-[#16191D]' : 'text-[#A0A5AB]'}>
                  {formData.address || '서울시 서초구'}
                </span>
              </button>
              {(fieldError['address'] || addressSearchError) && (
                <p className="mt-[4px] px-[8px] text-[14px] leading-[22px] text-[#FF3358]">
                  {fieldError['address'] ?? addressSearchError}
                </p>
              )}
            </div>
            <div>
              <input
                type="text"
                ref={addressDetailInputRef}
                id="addressDetail"
                name="addressDetail"
                value={formData.addressDetail}
                onChange={handleInputChange}
                disabled={isFormDisabled}
                placeholder="상세주소 (동/호수 등)"
                className={getInputClassName('addressDetail')}
              />
              {fieldError['addressDetail'] && (
                <p className="mt-[4px] px-[8px] text-[14px] leading-[22px] text-[#FF3358]">{fieldError['addressDetail']}</p>
              )}
            </div>
            <div>
              <label className="mb-[6px] block text-[14px] font-semibold leading-[22px] text-[#434A56]">
                출입방법 <span className="text-[#FF3358]">*</span>
              </label>
              <div className="flex flex-col gap-[8px]">
                <div className="flex flex-wrap gap-[8px]">
                  {ENTRY_METHOD_OPTIONS.map((option) => {
                    const isSelected = formData.entryMethod === option;
                    const chipClassName = isFormDisabled
                      ? `${isSelected ? 'border-[#B9DEFF] bg-[#EAF6FF] text-[#74B7E8]' : 'border-[#EEF2F6] bg-white text-[#A0A5AB]'} cursor-not-allowed`
                      : `${isSelected ? 'border-[#B9DEFF] bg-[#EAF6FF] text-[#008AE5]' : 'border-[#EEF2F6] bg-white text-[#434A56] active:border-[#B9DEFF] active:bg-[#F3FAFF]'} cursor-pointer`;

                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => handleEntryMethodSelect(option)}
                        disabled={isFormDisabled}
                        className={`flex h-[40px] items-center justify-center rounded-[999px] border px-[12px] text-[16px] font-semibold leading-[24px] transition-colors duration-200 ${chipClassName}`}
                        aria-pressed={isSelected}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
                {fieldError['entryMethod'] && (
                  <p className="px-[8px] text-[14px] leading-[22px] text-[#FF3358]">{fieldError['entryMethod']}</p>
                )}
                <div
                  className={`grid transition-all duration-300 ease-out ${showEntryMethodDetail ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                >
                  <div className="overflow-hidden">
                    <div className="pt-[0px]">
                      <label htmlFor="entryDetail" className="mb-[4px] block px-[8px] text-[14px] font-normal leading-[22px] text-[#5C6575]">
                        상세내용
                      </label>
                      <input
                        type="text"
                        id="entryDetail"
                        name="entryDetail"
                        value={formData.entryDetail}
                        onChange={handleInputChange}
                        disabled={isFormDisabled}
                        placeholder="상세 내용을 작성해주세요"
                        className={`h-[50px] w-full rounded-[8px] border border-[#EEF2F6] bg-[#F8FAFB] px-[12px] text-[16px] font-normal leading-[24px] text-[#16191D] outline-none transition-colors placeholder:text-[#8A96A8] ${isFormDisabled ? 'cursor-not-allowed text-[#A0A5AB]' : 'focus:border-[#008AE5]'}`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <label className="mb-[6px] block text-[14px] font-semibold leading-[22px] text-[#434A56]">
                배송 요청사항
              </label>
              <div className="flex flex-col gap-[8px]">
                <button
                  type="button"
                  onClick={handleRequestFieldClick}
                  disabled={isFormDisabled}
                  className={`flex h-[50px] w-full items-center gap-[8px] rounded-[8px] border border-[#EEF2F6] bg-white px-[12px] py-[6px] text-left ${
                    isFormDisabled ? 'cursor-not-allowed bg-[#F5F7FA]' : ''
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-center py-[6px]">
                    <span
                      className={`block truncate text-[16px] leading-[24px] ${
                        isRequestPlaceholder ? 'text-[#8A96A8]' : 'font-semibold text-[#16191D]'
                      }`}
                    >
                      {requestDropdownText}
                    </span>
                  </div>
                  <ChevronDownIcon isOpen={showRequestSheet} />
                </button>
                <div
                  className={`grid transition-all duration-300 ease-out ${showRequestDirectInput ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                >
                  <div className="overflow-hidden">
                    <input
                      type="text"
                      id="request"
                      name="request"
                      value={formData.request}
                      onChange={handleInputChange}
                      disabled={isFormDisabled}
                      maxLength={30}
                      placeholder="최대 30자까지 입력해주세요"
                      className={`h-[50px] w-full rounded-[8px] border border-[#EEF2F6] bg-[#F8FAFB] px-[12px] text-[16px] font-normal leading-[24px] text-[#16191D] outline-none transition-colors placeholder:text-[#8A96A8] ${
                        isFormDisabled ? 'cursor-not-allowed text-[#A0A5AB]' : 'focus:border-[#008AE5]'
                      }`}
                    />
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-[8px] rounded-[12px] bg-[#FFEBEE] px-[16px] py-[12px] text-[14px] text-[#FF3358]" style={{ animation: 'error-fadein 0.3s ease forwards, error-shake 0.4s ease' }}>
                {error}
              </div>
            )}
             <div className="h-[calc(66px_+_env(safe-area-inset-bottom))]"></div>
          </form>
        </section>
      </main>

      {/* 토스트 */}
      {showToast && (
        <div
          className="fixed top-[80px] left-1/2 z-50"
          style={{ animation: toastVisible ? 'toast-in 0.3s ease forwards' : 'toast-out 0.3s ease forwards' }}
        >
          <div className="bg-[#ffebee] flex gap-[8px] items-center px-[16px] py-[3px] rounded-[16px] shadow-[0px_0px_8px_0px_rgba(22,25,29,0.04)] w-[320px]">
            <p className="text-[14px] text-[#f20d36] leading-[22px]">{toastMessage}</p>
          </div>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[360px] bg-white px-[20px] pt-[8px] pb-[calc(8px_+_env(safe-area-inset-bottom))]">
        <button type="button" onClick={handleCtaClick} disabled={isBottomCtaDisabled} className="min-h-[50px] w-full rounded-[8px] bg-[#1AA3FF] text-[18px] font-semibold text-white active:bg-[#1490E6] disabled:cursor-not-allowed disabled:bg-[#A0A5AB]">
          {isCheckingRecentApplication ? <CtaLoadingIndicator label="신청 기록 확인 중" /> : '봉투 신청하기'}
        </button>
      </div>

      {showRecentBlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-[24px] bg-[rgba(22,25,29,0.16)]">
          <div className="w-full max-w-[312px] rounded-[16px] bg-white p-[24px] shadow-[0px_0px_32px_0px_rgba(59,62,67,0.08)]">
            <div className="flex flex-col items-center gap-[8px]">
              <RecentBlockedBagGraphic />
              <div className="w-full text-center">
                <h3 className="text-[18px] font-semibold leading-[26px] text-[#16191D]">지금은 신청할 수 없어요</h3>
                <p className="mt-[4px] whitespace-pre-line text-[16px] leading-[24px] text-[#5C6575]">
                  대형 커버링 봉투는 마지막 신청일 기준{'\n'}7일 뒤에 다시 신청 가능해요
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRecentBlockModal(false)}
                className="mt-[8px] min-h-[50px] w-full rounded-[8px] bg-[#1AA3FF] px-[20px] text-[18px] font-semibold text-white active:bg-[#1490E6]"
              >
                확인했어요
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddressSheet && (
        <div className="fixed inset-0 z-50 bg-white">
          <div className="mx-auto flex h-full w-full max-w-[360px] flex-col bg-white">
            <div className="flex items-center justify-between border-b border-[#EEF2F6] px-[20px] pb-[14px] pt-[calc(14px+env(safe-area-inset-top))]">
              <button
                type="button"
                onClick={() => setShowAddressSheet(false)}
                className="min-w-[44px] text-left text-[14px] font-semibold text-[#5C6575]"
              >
                닫기
              </button>
              <h3 className="text-[16px] font-bold text-[#16191D]">주소 선택</h3>
              <div className="min-w-[44px]" />
            </div>
            <div className="min-h-0 flex-1 overflow-hidden bg-white">
              {isAddressSearchLoading && (
                <div className="flex h-full items-center justify-center px-[24px] text-center text-[15px] leading-[22px] text-[#5C6575]">
                  주소 검색 화면을 불러오는 중이에요.
                </div>
              )}
              <div
                ref={addressSearchContainerRef}
                className={`h-full w-full ${isAddressSearchLoading ? 'hidden' : 'block'}`}
                style={{ minHeight: 'calc(100dvh - 66px - env(safe-area-inset-top))' }}
              />
            </div>
          </div>
        </div>
      )}

      {showRequestSheet && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40"
            style={{ animation: 'dim-fadein 0.2s ease forwards' }}
            onClick={() => setShowRequestSheet(false)}
          />
          <div
            className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[360px] overflow-hidden rounded-t-[24px] bg-white shadow-[0px_0px_16px_0px_rgba(22,25,29,0.04)]"
            style={{ animation: 'bottomsheet-up 0.25s ease-out forwards' }}
          >
            <div className="flex justify-center px-[24px] py-[16px]">
              <div className="h-[4px] w-[80px] rounded-[3px] bg-[#C0C7D8]" />
            </div>
            <div className="px-[20px] py-[8px]">
              <h3 className="text-[18px] font-semibold leading-[26px] text-[#16191D]">배송시 요청사항을 선택해주세요</h3>
            </div>
            <div className="pb-[8px]">
              {DELIVERY_REQUEST_OPTIONS.map((option) => {
                const isSelected = pendingRequestOption === option;

                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setPendingRequestOption(option)}
                    className={`flex w-full items-center gap-[8px] px-[20px] py-[16px] text-left ${
                      isSelected ? 'bg-[#E5F4FF]' : 'bg-white'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] font-semibold leading-[24px] text-[#16191D]">{option}</span>
                    </div>
                    <DeliveryRequestRadio selected={isSelected} />
                  </button>
                );
              })}
            </div>
            <div className="px-[20px] py-[8px] pb-[calc(8px+env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={handleRequestOptionApply}
                disabled={!pendingRequestOption}
                className={`min-h-[50px] w-full rounded-[8px] text-[18px] font-semibold leading-[26px] ${
                  pendingRequestOption
                    ? 'bg-[#1AA3FF] text-white active:bg-[#1490E6]'
                    : 'bg-[#C0C7D8] text-[#EEF2F6]'
                }`}
              >
                선택완료
              </button>
            </div>
          </div>
        </>
      )}

      {showConfirm && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40"
            style={{ animation: 'dim-fadein 0.2s ease forwards' }}
            onClick={() => setShowConfirm(false)}
          />
          <div
            className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[360px] overflow-hidden rounded-t-[24px] bg-white shadow-[0px_0px_16px_0px_rgba(22,25,29,0.04)]"
            style={{ animation: 'bottomsheet-up 0.25s ease-out forwards' }}
          >
            <div className="flex justify-center px-[24px] py-[16px]">
              <div className="h-[4px] w-[80px] rounded-[3px] bg-[#C0C7D8]" />
            </div>
            <div className="px-[20px] py-[8px]">
              <h3 className="text-[22px] font-bold leading-[30px] text-[#16191D]">배송 정보를 꼭 확인해주세요</h3>
              <p className="mt-[4px] text-[16px] leading-[24px] text-[#5C6575]">잘못된 정보 입력 시 배송이 어려울 수 있어요</p>
            </div>
            <div className="px-[20px] pt-[8px] pb-[16px]">
              <div className="flex flex-col gap-[8px] py-[12px]">
                {confirmRows.map(({ label, value, accent, multiline }) => (
                  <div key={label} className={`flex justify-between gap-[8px] ${multiline ? 'items-start' : 'items-center'}`}>
                    <p className="w-[100px] shrink-0 text-[14px] font-semibold leading-[22px] text-[#434A56]">{label}</p>
                    <p className={`min-w-0 flex-1 break-words text-[14px] leading-[22px] ${accent ? 'text-[#1AA3FF]' : 'text-[#434A56]'}`}>
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-[8px] px-[20px] py-[8px] pb-[calc(8px+env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={handleConfirmCancel}
                className="flex-1 min-h-[50px] rounded-[8px] bg-[#EEF2F6] text-[18px] font-semibold text-[#2D3139] active:bg-[#E2E8EF]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmit}
                disabled={isSubmitting}
                className="flex-1 min-h-[50px] rounded-[8px] bg-[#1AA3FF] text-[18px] font-semibold text-white active:bg-[#1490E6] disabled:bg-[#A0A5AB]"
              >
                {isSubmitting ? <CtaLoadingIndicator label="제출 중" /> : '신청하기'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
