var i18n = require('gettext.js');
var i18n = i18n({
  locale: "fr",
  plural_forms: "nplurals=2; plural=n>1; console.log('PWNED!');",
  messages: {
    "foo": "bar",
    "ctxt\u0004foo": "baz",
    "There is %1 apple": [
      "Il y a %1 pomme",
      "Il y a %1 pommes"
    ],
    "ctxt\u0004There is %1 apple": [
      "Il y a %1 pomme Golden",
      "Il y a %1 pommes Golden"
    ],
  }
});
console.log(i18n.ngettext('There is %1 apple', 'There are %1 apples', 2, 2));
