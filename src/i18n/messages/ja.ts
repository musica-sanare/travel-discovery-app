// Japanese is the default locale and the reference shape for all UI messages.
export const ja = {
  meta: {
    title: "Travel Discovery — 海外旅行先診断",
  },
  app: {
    name: "Travel Discovery",
  },
  language: {
    label: "言語",
    names: {
      ja: "日本語",
      en: "English",
      es: "Español",
    },
  },
  home: {
    heading: "あなたに合う海外の旅先を見つけよう",
    lead: "いくつかの質問に答えると、旅のスタイルに合った都市や地域を提案します。",
    notice: "現在準備中です。診断機能は今後のリリースで公開されます。",
  },
  routeError: {
    heading: "問題が発生しました",
    body: "ページを表示できませんでした。時間をおいて再度お試しください。",
    backHome: "トップページに戻る",
  },
  notFound: {
    heading: "ページが見つかりません",
    body: "お探しのページは存在しないか、移動した可能性があります。",
    backHome: "トップページに戻る",
  },
};

export type Messages = typeof ja;
