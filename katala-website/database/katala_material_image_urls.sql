-- Maps each material model to its cleaned catalog image.
-- These root-relative URLs are served from public/catalog by the web app.
UPDATE public.tbl_productvariant
SET v_variantimageurl = CASE v_productmodel
  WHEN 'HK-A-01' THEN '/catalog/hk-a-01.png'
  WHEN 'HK-A-02' THEN '/catalog/hk-a-02.png'
  WHEN 'HK-A-03' THEN '/catalog/hk-a-03.png'
  WHEN 'HK-A-04' THEN '/catalog/hk-a-04.png'
  WHEN 'HK-C-01' THEN '/catalog/hk-c-01.png'
  WHEN 'HK-C-02' THEN '/catalog/hk-c-02.png'
  WHEN 'HK-C-03' THEN '/catalog/hk-c-03.png'
  WHEN 'HK-C-04' THEN '/catalog/hk-c-04.png'
  WHEN 'FACP' THEN '/catalog/fire-alarm-panel-v2.png'
  WHEN 'SD-BAT' THEN '/catalog/smoke-detector-battery-v2.png'
  WHEN 'HK-D-09' THEN '/catalog/hk-d-09-v2.png'
  WHEN 'HK-D-10' THEN '/catalog/hk-d-10-v2.png'
  WHEN 'PUMP' THEN '/catalog/fire-pump-assembly.png'
  ELSE v_variantimageurl
END
WHERE v_productmodel IN (
  'HK-A-01', 'HK-A-02', 'HK-A-03', 'HK-A-04',
  'HK-C-01', 'HK-C-02', 'HK-C-03', 'HK-C-04',
  'FACP', 'SD-BAT', 'HK-D-09', 'HK-D-10', 'PUMP'
);
