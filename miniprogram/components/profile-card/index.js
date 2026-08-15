// components/profile-card/index.js —— 资料卡组件（P1 由 recommend-card 演进而来，纯展示）
const { formatAge, formatHeight } = require('../../utils/format.js');

Component({
  properties: {
    user: {
      type: Object,
      value: {},
    },
  },
  data: {
    ageText: '',
    heightText: '',
  },
  observers: {
    user(user) {
      if (!user) return;
      this.setData({
        ageText: formatAge(user.age) || (user.age != null ? user.age : ''),
        heightText: formatHeight(user.height),
      });
    },
  },
  methods: {
    onTap() {
      this.triggerEvent('tap', { user: this.data.user });
    },
    onLike() {
      this.triggerEvent('like', { user: this.data.user });
    },
    onPass() {
      this.triggerEvent('pass', { user: this.data.user });
    },
  },
});
