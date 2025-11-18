import nextra from 'nextra';

const withNextra = nextra({
	theme: 'nextra-theme-docs',
	themeConfig: './theme.config.jsx',
	defaultShowCopyCode: true,
});

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
	staticPageGenerationTimeout: 1200, // Timeout after 10 minutes (600 seconds)
	swcMinify: true,

	eslint: {
		ignoreDuringBuilds: true
	},
	webpack: (config, options) => {
		config.experiments = {
			layers: true,
			topLevelAwait: true,
		};
		return config;
	},
	pageExtensions: ["js", "jsx", "ts", "tsx", "md", "mdx"],
	images: {

		formats: ["image/avif", "image/webp"],
		domains: [
			"source.unsplash.com",
			"tailwindui.com",
			"images.unsplash.com",
			"cdn.pixabay.com",
			"globalconflicts.net",
			"launcher.globalconflicts.net",
			"imgur.com",
			"i.imgur.com",
			"cdn.discordapp.com",
			"community.cloudflare.steamstatic.com",
			"avatars.akamai.steamstatic.com"
		],
	},
	async redirects() {
		return [
			{
				source: "/guides",
				destination: "/guides/getting-started",
				permanent: true,
			},
			{
				source: "/",
				has: [
					{
						type: "query",
						key: "callbackUrl",
					},
				],
				permanent: true,
				destination: "/",
			},
		];
	},
};

export default withNextra(nextConfig);
