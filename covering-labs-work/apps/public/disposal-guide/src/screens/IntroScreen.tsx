import BottomBar from '../components/BottomBar';
import { BASE_PATH } from '../utils/basePath';

interface Props {
  onStart: () => void;
}

export default function IntroScreen({ onStart }: Props) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-5">
        <img
          src={`${BASE_PATH}/noticeBoardGraphic.svg`}
          alt=""
          width={80}
          height={80}
          className="h-[120px] w-[120px]"
        />

        <div className="mt-6 flex flex-col gap-1 text-center">
          <p className="text-body1-regular text-text-default">몇가지 질문만 대답하면</p>
          <p className="text-title2 text-text-default">나에게 맞는 서비스 알려드려요!</p>
        </div>
      </div>

      <BottomBar label="시작하기" onClick={onStart} />
    </div>
  );
}
