export default {
	logo: null, // Hide logo since you have your own navbar
	project: {
		link: 'https://github.com/your-org/global-conflicts-website'
	},
	docsRepositoryBase: 'https://github.com/your-org/global-conflicts-website/tree/main',
	chat: {
		link: null // Disable chat link
	},
	useNextSeoProps() {
		return {
			titleTemplate: '%s – Global Conflicts'
		}
	},
	navigation: false, // Disable Nextra top navigation
	navbar: {
		component: null, // Completely hide Nextra navbar
	},
	darkMode: false, // Remove dark mode toggle
	footer: {
		text: null // Disable Nextra footer since you have a custom one
	},
	feedback: {
		content: null // Remove "Question? Give us feedback" link
	},
	editLink: {
		text: null // Remove "Edit this page" link
	},
	head: null, // Use your existing _app.tsx head configuration
	primaryHue: 200,
	sidebar: {
		defaultMenuCollapseLevel: 1,
		toggleButton: true,
	},
	toc: {
		backToTop: true
	},
	search: {
		placeholder: 'Search documentation...'
	}
}
