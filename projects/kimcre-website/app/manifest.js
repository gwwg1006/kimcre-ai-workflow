export default function manifest() {
  return {
    name: '김명규크리에이티브 3D 프린팅',
    short_name: '김명규크리에이티브',
    description: '시제품 제작부터 소량 생산까지, 김명규크리에이티브가 함께하는 고품질 3D 프린팅 서비스입니다.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#4F46E5',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  };
}
