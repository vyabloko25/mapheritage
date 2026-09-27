/* MapHeritage: English by default, Russian on toggle */
(function () {
  const D = {
    en: {
      'nav.how': 'How it works', 'nav.create': 'Create a map', 'lang.toggle': 'RU', 'lang.name': 'Русский',
      'hero.title': 'Your family’s story, drawn as one map.',
      'hero.lead': 'Tell us where you and your relatives were born, grew up, studied and moved. MapHeritage turns the conversation into a map of routes, like the explorers’ maps in a school atlas, only about your family.',
      'hero.cta': 'Create your family map', 'hero.example': 'Example: the Levin family, 1930–1996', 'hero.replay': 'Replay the journey',
      'how.title': 'The map grows out of a conversation',
      'how.1.t': 'Tell your story in the chat',
      'how.1.p': 'The assistant asks one question at a time: who, where, when, and what happened. Start with yourself and work back to your great‑grandparents.',
      'how.2.t': 'Watch the map fill in',
      'how.2.p': 'Every place and every move appears on the map as you talk. Old names like Königsberg or Stalino are matched to where those places are today.',
      'how.3.t': 'Edit, export, share',
      'how.3.p': 'Correct any point by hand, download the map as an image, or send relatives a link where the journey plays back.',
      'story.quote': 'One map instead of a thousand words.',
      'story.p1': 'Every year we lose the people who remember where the family came from: evacuations, job assignments, moves across half a continent. These stories are rarely written down, so they disappear.',
      'story.p2': 'MapHeritage preserves the memory of how families moved. The places where your people were born, grew up, studied, and lived through hard and happy times come together on one map you can pass on to your children and grandchildren.',
      'gift.title': 'A gift made from your own history',
      'gift.p1': 'A family map is a personal gift for an anniversary, a wedding or a reunion, especially when two families with their own heritage come together.',
      'gift.p2': 'Build it with your parents or grandparents. The conversation about where they lived is often worth more than the gift itself.',
      'final.title': 'Start with one place: where you were born.',
      'final.note': 'Free. Only people you send the link to can see your map.',
      'footer.base': 'Base map: OpenStreetMap, CARTO',

      'tab.chat': 'Chat', 'tab.edit': 'Edit', 'tab.map': 'Map',
      'btn.new': 'New map', 'btn.open': 'Open map', 'btn.share': 'Share', 'btn.export': 'Export PNG', 'btn.send': 'Send',
      'title.ph': 'My family map', 'input.ph': 'Type your answer…',
      'hint': 'Enter to send, Shift + Enter for a new line. Only people with the link can see the map.',
      'thinking': 'Writing it down',
      'empty.t': 'Your map will appear here', 'empty.p': 'Answer the questions on the left. Every place you mention lands on the map.',
      'edit.people': 'People', 'edit.addPerson': 'Add person', 'edit.events': 'Places and events', 'edit.addEvent': 'Add place',
      'edit.emptyPeople': 'No one yet. Add a person or tell the chat about yourself.',
      'edit.emptyEvents': 'No places yet.',
      'f.person': 'Person', 'f.place': 'Place, as it was called', 'f.query': 'Search the map for', 'f.find': 'Find', 'f.pick': 'Pick on map',
      'f.picking': 'Click the map to set the location', 'f.year': 'Year', 'f.when': 'Date as told', 'f.type': 'Event', 'f.note': 'Note',
      'f.save': 'Save', 'f.delete': 'Delete', 'f.cancel': 'Cancel', 'f.nocoords': 'No location yet', 'f.coords': 'Location set',
      'name.ph': 'Name', 'relation.ph': 'Relation', 'swatch': 'Change colour', 'me': 'Me',
      'confirm.delPerson': 'Delete {name} and all their places?',
      'confirm.new': 'Start a new map? This one stays saved under “My maps”.',
      'toast.saved': 'Saved', 'toast.copied': 'Link copied', 'toast.removed': 'Removed',
      'toast.notFound': 'Place not found. Add a country, or pick it on the map.',
      'toast.exported': 'Image downloaded', 'toast.noTiles': 'The base map could not be included, so the image has routes only.',
      'toast.emptyMap': 'Add at least one place before exporting.',
      'myMaps': 'My maps', 'untitled': 'Untitled', 'noLoc': 'no location',
      'count.events': 'event|events', 'count.places': 'place|places',
      'btn.play': 'Play journey', 'btn.print': 'Print', 'btn.download': 'Download image', 'btn.continue': 'Edit map',
      'chronicle': 'Chronicle', 'notFound.t': 'Map not found', 'notFound.p': 'Check the link and try again.',
      'loadFail': 'The map didn’t load. Refresh the page.', 'cta.own': 'Make a map of your own family.', 'familyMap': 'Family map',
      'err.no_db': 'The database is not connected: add a D1 binding named DB in the Pages settings.',
      'err.not_found': 'This map no longer exists.', 'err.forbidden': 'You can’t edit this map from this browser.',
      'err.empty': 'Write something first.', 'err.too_long': 'This conversation is very long. Start a new map for the next branch of the family.',
      'err.no_model': 'The chat assistant is not connected: add a Workers AI binding named AI in the Pages settings.',
      'err.model_failed': 'The assistant didn’t answer. Send your message again.', 'err.network': 'No connection to the server. Check your internet and try again.',
      'type.birth': 'birth', 'type.childhood': 'childhood', 'type.study': 'studies', 'type.work': 'work', 'type.service': 'military service',
      'type.war': 'war', 'type.evacuation': 'evacuation', 'type.move': 'move', 'type.marriage': 'marriage', 'type.death': 'death', 'type.other': 'other',
    },
    ru: {
      'nav.how': 'Как это работает', 'nav.create': 'Создать карту', 'lang.toggle': 'EN', 'lang.name': 'English',
      'hero.title': 'История семьи, собранная в одну карту.',
      'hero.lead': 'Расскажите, где родились, росли, учились и куда переезжали вы и ваши близкие. MapHeritage превратит разговор в карту маршрутов, как в атласе великих путешествий, только о вашей семье.',
      'hero.cta': 'Создать карту семьи', 'hero.example': 'Пример: семья Левиных, 1930–1996', 'hero.replay': 'Проиграть путь ещё раз',
      'how.title': 'Карта складывается из разговора',
      'how.1.t': 'Расскажите в чате',
      'how.1.p': 'Помощник задаёт по одному вопросу: кто, где, когда и что тогда происходило. Можно начать с себя и дойти до прадедов.',
      'how.2.t': 'Смотрите, как растёт карта',
      'how.2.p': 'Каждое место и каждый переезд появляются на карте прямо во время разговора. Для старых названий вроде Кёнигсберга или Сталино помощник найдёт нынешнее место.',
      'how.3.t': 'Правьте, скачивайте, делитесь',
      'how.3.p': 'Любую точку можно поправить вручную, карту скачать картинкой, а родным отправить ссылку, где путь проигрывается как путешествие.',
      'story.quote': 'Одна карта вместо тысячи слов.',
      'story.p1': 'С каждым годом уходят люди, которые помнят, откуда пришла семья: эвакуации, распределения, переезды через полконтинента. Эти истории редко записывают, и они теряются.',
      'story.p2': 'MapHeritage сохраняет память о перемещениях семей. Места, где ваши близкие родились, провели детство, учились, пережили трудное и радостное, собираются на одной карте, которую можно передать детям и внукам.',
      'gift.title': 'Подарок, сделанный из вашей истории',
      'gift.p1': 'Карта семьи — личный подарок к юбилею, свадьбе или большой семейной встрече. Особенно когда соединяются две семьи, у каждой из которых своё наследие и свои дороги.',
      'gift.p2': 'Соберите карту вместе с родителями или бабушкой. Разговор о том, где они жили, часто оказывается дороже самого подарка.',
      'final.title': 'Начните с одного места — того, где родились вы.',
      'final.note': 'Бесплатно. Карту видят только те, кому вы отправите ссылку.',
      'footer.base': 'Картографическая основа: OpenStreetMap, CARTO',

      'tab.chat': 'Разговор', 'tab.edit': 'Правка', 'tab.map': 'Карта',
      'btn.new': 'Новая карта', 'btn.open': 'Открыть карту', 'btn.share': 'Поделиться', 'btn.export': 'Скачать PNG', 'btn.send': 'Отправить',
      'title.ph': 'Карта моей семьи', 'input.ph': 'Напишите ответ…',
      'hint': 'Enter — отправить, Shift + Enter — новая строка. Карту видят только те, у кого есть ссылка.',
      'thinking': 'Записываю',
      'empty.t': 'Здесь появится ваша карта', 'empty.p': 'Отвечайте на вопросы слева. Каждое место, о котором вы расскажете, ляжет на карту.',
      'edit.people': 'Люди', 'edit.addPerson': 'Добавить человека', 'edit.events': 'Места и события', 'edit.addEvent': 'Добавить место',
      'edit.emptyPeople': 'Пока никого. Добавьте человека или расскажите о себе в разговоре.',
      'edit.emptyEvents': 'Мест пока нет.',
      'f.person': 'Кто', 'f.place': 'Место, как оно тогда называлось', 'f.query': 'Искать на карте', 'f.find': 'Найти', 'f.pick': 'Указать на карте',
      'f.picking': 'Нажмите на карту, чтобы указать место', 'f.year': 'Год', 'f.when': 'Дата, как рассказали', 'f.type': 'Событие', 'f.note': 'Заметка',
      'f.save': 'Сохранить', 'f.delete': 'Удалить', 'f.cancel': 'Отмена', 'f.nocoords': 'Место на карте не задано', 'f.coords': 'Место на карте задано',
      'name.ph': 'Имя', 'relation.ph': 'Кем приходится', 'swatch': 'Сменить цвет', 'me': 'Я',
      'confirm.delPerson': 'Удалить {name} и все его места?',
      'confirm.new': 'Начать новую карту? Текущая сохранится в списке «Мои карты».',
      'toast.saved': 'Сохранено', 'toast.copied': 'Ссылка скопирована', 'toast.removed': 'Удалено',
      'toast.notFound': 'Место не нашлось. Добавьте страну или укажите его на карте.',
      'toast.exported': 'Картинка скачана', 'toast.noTiles': 'Подложку карты не удалось добавить, в картинке только маршруты.',
      'toast.emptyMap': 'Сначала добавьте хотя бы одно место.',
      'myMaps': 'Мои карты', 'untitled': 'Без названия', 'noLoc': 'нет места на карте',
      'count.events': 'событие|события|событий', 'count.places': 'место|места|мест',
      'btn.play': 'Проиграть путь', 'btn.print': 'Печать', 'btn.download': 'Скачать картинку', 'btn.continue': 'Редактировать',
      'chronicle': 'Хроника', 'notFound.t': 'Карта не найдена', 'notFound.p': 'Проверьте ссылку и попробуйте ещё раз.',
      'loadFail': 'Карта не загрузилась. Обновите страницу.', 'cta.own': 'Соберите карту своей семьи.', 'familyMap': 'Карта семьи',
      'err.no_db': 'База не подключена: добавьте привязку D1 с именем DB в настройках Pages.',
      'err.not_found': 'Этой карты больше нет.', 'err.forbidden': 'Эту карту нельзя редактировать из этого браузера.',
      'err.empty': 'Сначала напишите что-нибудь.', 'err.too_long': 'Разговор уже очень длинный. Начните новую карту для следующей ветви семьи.',
      'err.no_model': 'Чат-бот не подключён: добавьте привязку Workers AI с именем AI в настройках Pages.',
      'err.model_failed': 'Помощник не ответил. Отправьте сообщение ещё раз.', 'err.network': 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
      'type.birth': 'рождение', 'type.childhood': 'детство', 'type.study': 'учёба', 'type.work': 'работа', 'type.service': 'служба',
      'type.war': 'война', 'type.evacuation': 'эвакуация', 'type.move': 'переезд', 'type.marriage': 'свадьба', 'type.death': 'смерть', 'type.other': 'другое',
    },
  };
  let lang = 'en';
  try { const s = localStorage.getItem('mh:lang'); if (s === 'ru' || s === 'en') lang = s; } catch {}
  const subs = [];
  function t(k, v) {
    let s = (D[lang] && D[lang][k]) ?? D.en[k] ?? k;
    if (v) for (const x in v) s = s.split('{' + x + '}').join(v[x]);
    return s;
  }
  function plural(n, key) {
    const f = t(key).split('|');
    if (lang === 'ru') { const a = n % 10, b = n % 100; return f[a === 1 && b !== 11 ? 0 : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? 1 : 2]; }
    return n === 1 ? f[0] : f[1];
  }
  function apply(root = document) {
    document.documentElement.lang = lang;
    root.querySelectorAll('[data-i18n]').forEach((e) => (e.textContent = t(e.dataset.i18n)));
    root.querySelectorAll('[data-i18n-ph]').forEach((e) => (e.placeholder = t(e.dataset.i18nPh)));
    root.querySelectorAll('[data-i18n-label]').forEach((e) => { e.setAttribute('aria-label', t(e.dataset.i18nLabel)); e.title = t(e.dataset.i18nLabel); });
    root.querySelectorAll('[data-lang-toggle]').forEach((b) => { b.textContent = t('lang.toggle'); b.setAttribute('aria-label', t('lang.name')); b.title = t('lang.name'); });
  }
  function set(l) {
    lang = l;
    try { localStorage.setItem('mh:lang', l); } catch {}
    apply();
    subs.forEach((f) => f(l));
  }
  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('[data-lang-toggle]')) set(lang === 'en' ? 'ru' : 'en');
  });
  window.I18N = { t, plural, apply, set, on: (f) => subs.push(f), get lang() { return lang; } };
})();
