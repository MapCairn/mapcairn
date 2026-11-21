# What the AGPL means for your project

This is a plain-words guide for people who know MIT, Apache-2.0 or GPL-3.0 and want to know what MapCairn's licence asks of them. It is not legal advice. The licence text is the only authority, so if your project matters, read the [`LICENSE`](../../LICENSE) file and ask your own lawyer.

## The short version

- MapCairn is licensed under AGPL-3.0-only. It is an open-source licence that allows commercial use: you may use it, change it, sell a product built on it and charge for services that run it.
- The price is the source. If you give people an app that includes the SDK, you must offer them the corresponding source of the whole app, under the same licence.
- If you change the SDK and run your version as a service, you must offer the source of your version to the people who use that service over a network.
- Keeping an app's source private while distributing it, with the SDK inside, needs separate terms. A licence for closed-source use is not on offer yet.

## How it compares

|                                                            | MIT                                   | Apache-2.0                                                                       | GPL-3.0                                                              | AGPL-3.0                                                   |
| ---------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------- |
| Commercial use and charging for it                         | Yes                                   | Yes                                                                              | Yes                                                                  | Yes                                                        |
| Use in a closed-source product you distribute              | Yes                                   | Yes                                                                              | No: the combined work must be GPL-3.0                                | No: the combined work must be AGPL-3.0                     |
| What you must do when you distribute                       | Keep the copyright and licence notice | Keep notices, include the licence, mark your changes                             | Offer the source of the combined work under GPL-3.0 and keep notices | The same as GPL-3.0                                        |
| What you must do when you only run it as a network service | Nothing                               | Nothing                                                                          | Nothing                                                              | If you modified it, offer the modified source to the users |
| Patents                                                    | Silent                                | Express grant from contributors, which ends if you sue over a patent in the work | Express grant from contributors                                      | The same as GPL-3.0                                        |

AGPL-3.0 is GPL-3.0 with one added rule, section 13, for software that people use over a network.

## When it applies to a web app

- **Distributing.** The SDK's JavaScript runs in the visitor's browser, so your server hands each visitor a copy of it, bundled with your app. Treat that as distributing, even though no one downloads an installer. The duty then reaches the whole app that includes it, not only the SDK.
- **Inside your own organisation.** An app that only your own staff use, and that you give to nobody else, has no duty to offer its source. This is the point to be careful about: once people outside the organisation (contractors, partners, the public) use it, read the case above. If you are unsure, ask a lawyer.
- **Server-only code.** Running the SDK's code only on your server, unmodified, does not by itself trigger the network rule, which applies to a modified version. The SDK's interface still runs in the browser.

## What you must do when it applies

- Offer the corresponding source of the whole combined app under AGPL-3.0. That is your own code and what is needed to build, install and run it, not your operating system or general-purpose tools.
- Keep the copyright and licence notices, and include a copy of the licence.
- Say how a user can get the source, for example with a visible link in the app to a public repository.
- Your own code in the app can be under another licence that is compatible with the AGPL, such as MIT, but the app as a whole is offered under AGPL-3.0.

## If you modify the SDK and run it as a service

Section 13 asks you to offer the source of your modified version, prominently, to every user who interacts with it over a network. A visible link in the interface to where the source is published is the usual way to do it. If you keep your changes in a public repository, the duty is small.

## The case that needs separate terms

Using the SDK unmodified, as a dependency of a closed-source product you distribute, is the case that needs separate terms, because the AGPL would require the source of the whole product to be offered. That includes a closed-source web app, since it serves the SDK's JavaScript to browsers.

A licence for closed-source use is not on offer yet. The author is open to talking about other terms. The "Licence" section of the [README](../../README.md#licence) says how to get in touch. Any agreement would go towards the continued development of MapCairn.

## Examples

- **A hobby site.** Publish the site's source in a public repository under AGPL-3.0 and link to it from the site. That meets the licence.
- **An open-source app.** Publish the app's source under a licence compatible with the AGPL and offer the combined app under AGPL-3.0, with a link in the app.
- **An internal tool.** Used only inside your organisation, there is no duty to offer the source. If you modify the SDK and people outside the organisation use the tool over a network, section 13 applies.
- **A closed-source web service.** The app that includes the SDK reaches users' browsers, so its source would have to be offered. It needs separate terms, which are not on offer yet.
- **A closed-source mobile app.** Distributing the app with the SDK inside is distributing, so the source of the whole app would have to be offered under AGPL-3.0. App store terms can also conflict with the AGPL, which this guide does not settle. It needs separate terms and legal advice.

## Contributing

To contribute code, documentation or other material you agree to the contributor licence agreement. [`CONTRIBUTING.md`](../../CONTRIBUTING.md) says how, and [`CLA.md`](../../CLA.md) is the agreement. You keep the copyright in what you contribute.

## What this guide is unsure about

- Whether a particular app counts as "distributed" or as "used only inside your organisation" depends on the facts and the law where you are.
- How the AGPL fits with the terms of an app store.
- What exactly counts as the "corresponding source" of your build when it uses services or tools of your own.

For any of these, ask your own lawyer, and read the [`LICENSE`](../../LICENSE) file: sections 5 and 6 cover distributing, and section 13 covers use over a network.
