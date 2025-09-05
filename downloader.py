import re
import requests
import os
import sys


def extract_m3u_links():
    """从当前脚本中提取Markdown格式的M3U链接"""
    # 读取当前脚本内容
    with open(sys.argv[0], 'r', encoding='utf-8') as f:
        content = f.read()

    # 正则表达式匹配 Markdown 超链接格式: [名称](链接)
    pattern = r'(\d+)\.\s*\[(.*?)\]\((.*?\.m3u(8)?)\)'
    matches = re.findall(pattern, content)

    # 整理为字典列表
    links = []
    for match in matches:
        links.append({
            'index': int(match[0]),
            'name': match[1],
            'url': match[2]
        })

    # 按序号排序
    links.sort(key=lambda x: x['index'])
    return links


def download_m3u_file(url, filename):
    """下载M3U文件，若已存在则先删除"""
    try:
        # 若文件已存在则删除
        if os.path.exists(filename):
            os.remove(filename)
            print(f"已删除现有文件: {filename}")

        # 下载文件
        print(f"正在下载: {filename}...")
        response = requests.get(url, timeout=10)
        response.raise_for_status()  # 检查请求是否成功

        # 保存文件
        with open(filename, 'wb') as f:
            f.write(response.content)

        print(f"下载成功: {filename} ({len(response.content)} 字节)")
        return True

    except requests.exceptions.RequestException as e:
        print(f"下载失败: {str(e)}")
        return False
    except Exception as e:
        print(f"发生错误: {str(e)}")
        return False


def main():
    print("=" * 60)
    print("         M3U链接下载器         ")
    print("=" * 60)

    # 提取链接
    links = extract_m3u_links()

    if not links:
        print("未找到任何M3U链接，请在脚本中按以下格式添加链接：序号. [名称](链接)")
        return

    # 显示链接列表
    print("\n可用的M3U链接：")
    for link in links:
        print(f"{link['index']}. [{link['name']}]({link['url']})")

    # 循环处理用户输入
    while True:
        print("\n请输入要下载的序号 (输入0退出)：", end=" ")
        try:
            choice = input().strip()
            choice = int(choice)

            if choice == 0:
                print("感谢使用，再见！")
                break

            # 查找选中的链接
            selected = next(
                (link for link in links if link['index'] == choice), None)

            if selected:
                # 下载选中的链接
                download_m3u_file(selected['url'], f"{selected['name']}.m3u")

                # 询问是否继续
                print("\n是否继续下载其他文件？(输入序号继续，0退出)：", end=" ")
            else:
                print(f"无效的序号: {choice}，请重新输入")

        except ValueError:
            print("请输入有效的数字")
        except Exception as e:
            print(f"发生错误: {str(e)}")
            break


# 在此处添加你的M3U链接，按照以下格式

# 1. [Kilvn_IPTV](https://live.kilvn.com/iptv.m3u)


if __name__ == "__main__":
    main()
