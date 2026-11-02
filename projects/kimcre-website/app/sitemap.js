export default function sitemap() {
  const baseUrl = 'https://kimcre.shop';

  const routes = [
    { url: '', changeFrequency: 'daily', priority: 1.0 },
    { url: '/services', changeFrequency: 'weekly', priority: 0.8 },
    { url: '/portfolio', changeFrequency: 'daily', priority: 0.8 },
    { url: '/quote', changeFrequency: 'monthly', priority: 0.7 },
    { url: '/contact', changeFrequency: 'monthly', priority: 0.6 },
    { url: '/privacy', changeFrequency: 'monthly', priority: 0.5 },
    { url: '/refund', changeFrequency: 'monthly', priority: 0.5 },
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route.url}`,
    lastModified: new Date().toISOString(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
