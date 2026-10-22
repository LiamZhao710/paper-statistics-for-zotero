"""Create tiny valid, local synthetic PDFs with known pages/captions (no libraries)."""
from pathlib import Path

def pdf(pages):
    objects = [b'', b'<< /Type /Catalog /Pages 2 0 R >>', b'']
    objects.append(b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
    kids=[]
    for lines in pages:
        pageid=len(objects); contentid=pageid+1; kids.append(f'{pageid} 0 R')
        objects.append(f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents {contentid} 0 R >>'.encode())
        content='BT /F1 12 Tf 50 740 Td 24 TL\n'
        for line in lines:
            escaped=line.replace('\\','\\\\').replace('(','\\(').replace(')','\\)')
            content+=f'({escaped}) Tj T*\n'
        data=(content+'ET').encode('ascii')
        objects.append(f'<< /Length {len(data)} >>\nstream\n'.encode()+data+b'\nendstream')
    objects[2]=f'<< /Type /Pages /Count {len(kids)} /Kids [{" ".join(kids)}] >>'.encode()
    output=bytearray(b'%PDF-1.4\n'); offsets=[0]
    for n,obj in enumerate(objects[1:],1):
        offsets.append(len(output)); output.extend(f'{n} 0 obj\n'.encode()+obj+b'\nendobj\n')
    start=len(output); output.extend(f'xref\n0 {len(objects)}\n0000000000 65535 f \n'.encode())
    for offset in offsets[1:]: output.extend(f'{offset:010d} 00000 n \n'.encode())
    output.extend(f'trailer\n<< /Size {len(objects)} /Root 1 0 R >>\nstartxref\n{start}\n%%EOF\n'.encode())
    return output

if __name__ == '__main__':
    root=Path(__file__).resolve().parents[1]/'tests'/'fixtures';root.mkdir(parents=True,exist_ok=True)
    (root/'paper.pdf').write_bytes(pdf([
        ['Synthetic Research Paper','Alpha beta gamma.','Fig. 1. Architecture of the system.','Table 1. Comparison of methods.'],
        ['Results','As shown in Fig. 1, the system works.','Figure 2: Measured performance.','Table II. Additional measurements.'],
        ['References','[1] Smith A. First paper.','[2] Wang B. Second paper.','[3] Jones C. Third paper.']]))
    (root/'blank.pdf').write_bytes(pdf([[],[]]))
    (root/'replacement.pdf').write_bytes(pdf([['Replacement paper','Figure 7. Replacement caption.']]))
    (root/'corrupt.pdf').write_bytes(b'%PDF-1.4\nnot a valid PDF')
    (root/'structures.pdf').write_bytes(pdf([
        ['Mathematical Structures','Definition 1. A definition is not a theorem.',
         'Proposition 1. Every tree is connected.','Theorem 1. Let a solution exist.',
         'Lemma 2.1. Let x be positive.','Corollary A.1. All solutions converge.',
         'As shown in Theorem 99, this is only a mention.'],
        ['Algorithms','Algorithm 1: Main iterative solver','Algorithm I. Repeated solver caption',
         'Algorithm II: Second solver','Algorithm 9 is used in our experiments.'],
        ['Equations','x = y + 1     (1)','z = 2*x     (2a)','z = 3*x     (2b)',
         'f(x) <= 1     (A.1)','See Eq. (99) for the discussion.']]))
    (root/'author-year.pdf').write_bytes(pdf([['Bibliography',
        'Smith, J. (2020). First research article.',
        'Wang, X., 2021. Second research article.',
        'Jones, M. (2022a). Third research article.']]))
    print(root)
