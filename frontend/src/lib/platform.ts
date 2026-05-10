export type Platform = 'xiaohongshu' | 'video_channel' | 'bilibili';

export const PLATFORM_LABEL: Record<Platform, string> = {
  xiaohongshu: '小红书',
  video_channel: '视频号',
  bilibili: 'B站',
};

export const PLATFORM_COLOR: Record<Platform, string> = {
  xiaohongshu: 'bg-[#FF2442] text-white',
  video_channel: 'bg-[#07C160] text-white',
  bilibili: 'bg-[#FB7299] text-white',
};

export const PLATFORM_OPTIONS: Array<{ value: Platform; label: string }> = [
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'video_channel', label: '视频号' },
  { value: 'bilibili', label: 'B站' },
];
