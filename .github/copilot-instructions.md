我想为网页添加 Liquid Glass 特效，然而 Web 的特性决定了元素无法获取其下方内容并添加折射，SVG 滤镜也能力有限。因此我有个大胆的想法，通过 Canvas 绘制整个网页内容来实施折射效果。

具体而言：

创建一组用 Canvas 绘制的组件，例如按钮等。让开发者通过一种简单的语法来写组件，由组件库编译为 Canvas 语法来绘制。
允许开发者提供一个 div，通过 html2canvas 转换为 Canvas。实际使用时，显示在界面上的是 div，而转换的 Canvas 提供给 Liquid Glass 层使用。
我的想法是，使用 Vue 作为框架，开发一个 Vue 组件库，提供 <LiquidGlassMaterial> 作为 Glass 材料，应用一个圆角矩形的带折射和扭曲效果的背景 Canvas，一个模拟光效的 Border，内容为一个 <template> 来允许自定义。在用户点击时，这个 <LiquidGlassMaterial> 也负责呈现点击的变形效果。

同时提供 <LiquidGlass>，在这个层中的元素会被用作 Liquid Glass 的背景。提供 <LiquidGlassBackdropCanvas> 允许开发者直接通过写代码生成 Canvas 用作页面展示和 Liquid Glass 背景；提供 <LiquidGlassBackdropConverter> 作为需要应用 html2canvas 的内容层；提供 <LiquidGlassBackdropScrollArea> 作为需要监听的滚动层。

在发生 LiquidGlass 内容层更新事件，或 LiquidGlassMaterial 发生点击等需要重新计算的事件时：

如果 BackdropCanvas/BackdropConverter 的内容或大小有变化，重新截取
如果 ScrollArea 有滚动，重新计算位置，或和下一步一块进行
获取所有 BackdropCanvas/BackdropConverter/ScrollArea 的位置，将其图像排布成页面范围的大 Canvas
获取所有 LiquidGlassMaterial 的位置，在大 Canvas 的这些位置应用 Liquid Glass 效果
通过裁剪或类似雪碧图等方式让 LiquidGlassMaterial 截取大 Canvas 的效果
具体的技术细节与 AI 探讨后 在 [需求](../.development/doc/需求.md) & [开发计划](../.development/doc/开发计划.md) 中。Liquid Glass 效果参考 Telegram Android 的效果和外部存储库 https://github.com/Muggleee/liquid-glass，将其 Java 转换为 Canvas&JS 实现。 [tAndroidReference](../.development/tAndroidReference/README.md)

组件库&技术栈为 Vite+Vue+TS 开发。

**每次做出修改后，不要急于结束对话，而是尝试运行 pnpm dev，收集我的反馈后按要求继续对话。**
