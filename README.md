# vdec · 视觉决策评测与交互文章

网站：**https://donglinkang2021.github.io/vdec/**

此公开仓库保存生成后的文档网站。`site/` 由独立开发仓库的发布流程维护，请勿直接修改生成页面；项目源码和原始实验运行记录不在此仓库发布。

网站包括 benchmark 交互指南、指标说明、GenCeption 文章与历史报告。当前套件的教学演示不代表模型实测成绩。

## 首次启用

在此仓库的 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。将本初始化包提交到 `main` 后，`Deploy Pages` 工作流会发布 `site/`。也可以在 Actions 中手动运行。

## 更新与回退

网站更新推送到 `main` 后会自动部署。需要回退时撤销对应的网站更新提交并推送；保留 `.github/workflows/pages.yml` 即可自动重新发布。部署结果与网址见 Actions 和 Settings → Pages。
