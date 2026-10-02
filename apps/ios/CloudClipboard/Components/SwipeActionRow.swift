//
//  SwipeActionRow.swift
//  CloudClipboard
//
//  自定义左滑操作容器：露出「复制 / 删除」两个与内容卡片等高的圆角按钮。
//  使用 simultaneousGesture + 轴向判定，纵向滑动交给 ScrollView，不拦截滚动。
//

import SwiftUI

/// 管理当前展开的行：同一时刻只允许一行展开。
final class SwipeManager: ObservableObject {
    @Published var openID: String?
    func close() { openID = nil }
}

struct SwipeActionRow<Content: View>: View {
    let id: String
    @ObservedObject var manager: SwipeManager
    var cornerRadius: CGFloat
    var buttonWidth: CGFloat
    var buttonSpacing: CGFloat
    var onCopy: () -> Void
    var onDelete: () -> Void
    @ViewBuilder var content: () -> Content

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var offset: CGFloat = 0
    @State private var dragStart: CGFloat = 0
    @State private var axis: Axis?
    @State private var isDragging = false

    private var openWidth: CGFloat { buttonWidth * 2 + buttonSpacing }

    private enum Axis { case horizontal, vertical }

    var body: some View {
        ZStack(alignment: .trailing) {
            actionButtons
            content()
                .offset(x: offset)
        }
        .clipped()
        .simultaneousGesture(dragGesture)
        .onChange(of: manager.openID) { newValue in
            // 其他行展开时，自动收起本行
            if newValue != id, offset != 0, !isDragging {
                animate(to: 0)
            }
        }
    }

    // MARK: 操作按钮（与卡片等高、等圆角）
    private var actionButtons: some View {
        HStack(spacing: buttonSpacing) {
            actionButton(
                title: "复制",
                systemImage: "doc.on.doc",
                fill: Color.accentColor,
                action: handleCopy
            )
            actionButton(
                title: "删除",
                systemImage: "trash",
                fill: Color.red,
                action: handleDelete
            )
        }
        .frame(width: openWidth)
        .frame(maxHeight: .infinity)
        .opacity(buttonOpacity)
    }

    private func actionButton(title: String, systemImage: String, fill: Color,
                              action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: systemImage)
                    .font(Typography.font(size: 19, weight: .semibold, relativeTo: .body))
                Text(title)
                    .font(Typography.caption2Semibold)
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            // 严格的圆角矩形容器：宽度固定，高度与左侧内容方块一致（ZStack 拉伸）
            .background(
                fill,
                in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            )
        }
        .frame(width: buttonWidth)
        .buttonStyle(.plain)
    }

    // 按钮随滑动轻微淡入，避免突兀
    private var buttonOpacity: Double {
        let revealed = -offset
        return Double(min(1, max(0, revealed / openWidth)))
    }

    // MARK: 手势
    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: 8, coordinateSpace: .local)
            .onChanged { value in
                if axis == nil {
                    let dx = abs(value.translation.width)
                    let dy = abs(value.translation.height)
                    axis = dx > dy ? .horizontal : .vertical
                    if axis == .horizontal {
                        isDragging = true
                        dragStart = manager.openID == id ? -openWidth : 0
                    }
                }
                guard axis == .horizontal else { return }

                var proposed = dragStart + value.translation.width
                proposed = min(0, proposed)
                // 越过全开位置后增加阻尼（橡皮筋）
                if proposed < -openWidth {
                    proposed = -openWidth - (abs(proposed) - openWidth) * 0.18
                }
                offset = proposed
            }
            .onEnded { value in
                defer {
                    axis = nil
                    isDragging = false
                }
                // 纵向滑动：不改变展开状态，回归到当前应有位置
                guard axis == .horizontal else {
                    animate(to: manager.openID == id ? -openWidth : 0)
                    return
                }
                let velocity = value.predictedEndTranslation.width
                let shouldOpen: Bool
                if abs(velocity) > 300 {
                    shouldOpen = velocity < 0
                } else {
                    shouldOpen = offset < -openWidth * 0.5
                }
                if shouldOpen {
                    manager.openID = id
                    animate(to: -openWidth)
                } else {
                    manager.openID = nil
                    animate(to: 0)
                }
            }
    }

    private func handleCopy() {
        manager.openID = nil
        animate(to: 0)
        onCopy()
    }

    private func handleDelete() {
        manager.openID = nil
        animate(to: 0)
        onDelete()
    }

    private func animate(to target: CGFloat) {
        if reduceMotion {
            offset = target
        } else {
            withAnimation(Motion.spring) { offset = target }
        }
    }
}
