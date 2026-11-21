# What the AGPL means for your project

This is a plain-words guide for people who know MIT, Apache-2.0 or GPL-3.0 and want to know what MapCairn's licence asks of them. It is not legal advice. The licence text is the only authority, so if your project matters, read the [`LICENSE`](../../LICENSE) file and ask your own lawyer.

## The short version

- MapCairn is licensed under AGPL-3.0-only. It is an open-source licence that allows commercial use: you may use it, change it, sell a product built on it and charge for services that run it.
- The condition is that the source stays available. If you give people an app that includes the SDK, you must offer them the corresponding source of the code you combine with the SDK and serve with it, under the same licence.
- If you change the SDK and run your version as a service, you must offer the source of your version to the people who use that service over a network.
- The AGPL does not let you keep an app's source private while you distribute it with the SDK inside, because the combined work must be offered under the same licence.
- `-only` means later versions of the AGPL do not apply to MapCairn automatically (section 14). AGPL section 13 lets you combine AGPL code with GPL-3.0 code.

## How it compares

|                                                            | MIT                                   | Apache-2.0                                                                       | GPL-3.0                                                                                                                                | AGPL-3.0                                                   |
| ---------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Commercial use and charging for it                         | Yes                                   | Yes                                                                              | Yes                                                                                                                                    | Yes                                                        |
| Use in a closed-source product you distribute              | Yes                                   | Yes                                                                              | No: the combined work must be GPL-3.0                                                                                                  | No: the combined work must be AGPL-3.0                     |
| What you must do when you distribute                       | Keep the copyright and licence notice | Keep notices, include the licence, mark your changes                             | Offer the source of the combined work under GPL-3.0, keep notices, include the licence, mark your changes                              | The same as GPL-3.0                                        |
| What you must do when you only run it as a network service | Nothing                               | Nothing                                                                          | Nothing                                                                                                                                | If you modified it, offer the modified source to the users |
| Patents                                                    | Silent                                | Express grant from contributors, which ends if you sue over a patent in the work | Express grant from contributors (section 11); suing over a patent in the program breaks the licence and can end it (sections 10 and 8) | The same as GPL-3.0                                        |

AGPL-3.0 is GPL-3.0 with one added rule, section 13, for software that people use over a network.

## When it applies to a web app

- **Distributing.** The SDK's JavaScript runs in the visitor's browser, so your server hands each visitor a copy of it, bundled with your app. Treat that as distributing (the licence's word is "convey", defined in section 0), even though no one downloads an installer. The duty then reaches the code you combine with the SDK and serve with it, not only the SDK.
- **Inside your own organisation.** An app that only your own staff use, and that you give to nobody else, is not distributed, so the distribution duty does not apply. Once people outside the organisation (partners, customers, the public) use it, read the case above. Contractors who build or run the tool only for you, under your direction, are a narrow exception in section 2; contractors who simply use it are less clear, so ask a lawyer.
- **A separate server.** A backend your app talks to over HTTP or another network protocol is usually a separate program, not part of the combined work, so this duty does not reach it. Section 13 does, if that server runs a modified copy of MapCairn code.
- **Server-only use.** Running the SDK's code only on your server, unmodified, does not by itself trigger the network rule, which applies to a modified version. The SDK's interface still runs in the browser.

## What you must do when it applies

- Offer the corresponding source of the code you combine with the SDK and serve with it, under AGPL-3.0. That is the source needed to generate, install, run and modify that code, including your build scripts, not your operating system or general-purpose tools.
- Keep the copyright and licence notices, and include a copy of the licence.
- If you changed MapCairn's own files, mark them as changed, with a date (section 5(a)).
- The SDK's own interface has no screen that shows MapCairn's copyright or licence notices, so section 5(d) asks nothing extra of you; keep the licence headers in the source files you pass on.
- Say how a user can get the source, for example with a visible link in the app to a public repository.
- Offer the source of the version you actually serve, and keep it available as long as you serve that version (section 6(d)).
- Your own code in the app can be under another licence that is compatible with the AGPL, such as MIT, but the combined work is offered under AGPL-3.0.

You owe the source to the people who receive the app or use your modified version, not to everyone. They may pass it on under the AGPL, and you may not stop them (sections 4 and 10), so for a public site the source is in practice public.

## If you modify the SDK and run it as a service

Section 13 asks you to offer the source of your modified version, prominently, to every user who interacts with it over a network. If the full source of the version you run is in a public repository, a prominent link to it in the interface meets this.

## Closed-source apps

Using the SDK, even unmodified, as a dependency of a closed-source product you distribute is not possible under the AGPL, because it would require the source of the code you combine with it to be offered. That includes a closed-source web app, since it serves the SDK's JavaScript to browsers.

## Examples

- **A hobby site.** Publish the site's source in a public repository under AGPL-3.0 and link to it from the site. That is the usual way to meet the source duty; keep the notices too.
- **An open-source app.** Publish the app's source under a licence compatible with the AGPL and offer the combined work under AGPL-3.0, with a link in the app.
- **An internal tool.** Used only inside your organisation, it is not distributed, so there is no duty to offer the source of the code you combine with the SDK. Once people outside it open the tool in their browsers, they receive the SDK's code, so the distributing case above applies, modified or not.
- **A closed-source web service.** The app that includes the SDK reaches users' browsers, so the AGPL requires the source of the code you serve with it to be offered.
- **A closed-source mobile app.** Distributing the app with the SDK inside is conveying it, so the source of the app would have to be offered under AGPL-3.0. App store terms can also conflict with the AGPL, which this guide does not settle. Ask a lawyer before you rely on this.

## Contributing

To contribute code, documentation or other material you agree to the contributor licence agreement. [`CONTRIBUTING.md`](../../CONTRIBUTING.md) says how, and [`CLA.md`](../../CLA.md) is the agreement; it uses the family name "AGPL-3.0" where this guide says `AGPL-3.0-only`. You keep the copyright in what you contribute. Section 5 of the agreement promises the project stays available under the AGPL-3.0 or another OSI-approved licence for as long as it is published.

## What this guide is unsure about

- Whether section 13 asks you to offer a modified version's source to your own staff when only they use it.
- Whether a particular app counts as "distributed" or as "used only inside your organisation" depends on the facts and the law where you are.
- Where the combined work ends: code loaded separately (another script tag or a code-split chunk), and server-rendering code that imports the SDK.
- How the AGPL fits with the terms of an app store.

For any of these, ask your own lawyer, and read the [`LICENSE`](../../LICENSE) file: sections 4 to 6 cover conveying (distributing), and section 13 covers use over a network.
