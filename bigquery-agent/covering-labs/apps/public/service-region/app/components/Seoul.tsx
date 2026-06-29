import Image from 'next/image';

export default function Seoul() {
  return (
    <div className="relative bg-white w-full">
      <Image
        src="/images/map-seoul.png"
        alt="서울특별시 서비스 지역 안내"
        width={767}
        height={959}
        className="w-full h-auto"
        priority
      />
    </div>
  );
}
